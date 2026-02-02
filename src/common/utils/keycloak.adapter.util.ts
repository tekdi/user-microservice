import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { API_RESPONSES } from './response.messages';
import { LoggerUtil } from 'src/common/logger/LoggerUtil';
const axios = require('axios');

// Token cache to avoid fetching admin token on every request
interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedAdminToken: CachedToken | null = null;
let tokenFetchPromise: Promise<any> | null = null; // Promise for in-flight token fetch to prevent thundering herd

/**
 * Clear the cached admin token
 * Useful when a 401 error occurs and we need to force a fresh token
 */
function clearCachedAdminToken(): void {
  cachedAdminToken = null;
  LoggerUtil.log('Cleared cached Keycloak admin token');
}

function getUserRole(userRoles: string[]) {
  if (userRoles.includes('systemAdmin')) {
    return 'systemAdmin';
  } else if (userRoles.includes('facilitator')) {
    return 'facilitator';
  } else if (userRoles.includes('beneficiary')) {
    return 'beneficiary';
  } else return 'user';
}

function getUserGroup(role: string) {
  switch (role) {
    case 'systemAdmin':
      return 'systemAdmin';
    case 'facilitator':
      return 'facilitator';
    default:
      return 'beneficiary';
  }
}

/**
 * Fetch a new token from Keycloak
 * Internal helper function that performs the actual API call
 */
async function fetchNewToken(): Promise<any> {
  const axios = require('axios');
  const qs = require('qs');
  const now = Date.now();

  // Clear old cache before fetching new token to ensure clean state
  clearCachedAdminToken();

  const data = qs.stringify({
    username: process.env.KEYCLOAK_USERNAME,
    password: process.env.KEYCLOAK_PASSWORD,
    grant_type: 'password',
    client_id: 'admin-cli',
  });

  const config = {
    method: 'post',
    url: process.env.KEYCLOAK + process.env.KEYCLOAK_ADMIN_TOKEN,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: data,
    timeout: 10000, // 10 second timeout to prevent hanging
  };

  try {
    // Add timeout protection to prevent hanging if Keycloak is slow
    const tokenFetchWithTimeout = Promise.race([
      axios(config),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Token fetch timeout after 8 seconds')), 8000)
      ),
    ]);

    const res = await tokenFetchWithTimeout;

    // Cache the token with expiration
    if (res?.data?.access_token) {
      const expiresIn = (res.data.expires_in || 300) * 1000; // Default to 5 minutes (300 seconds) if not provided
      cachedAdminToken = {
        token: res.data.access_token,
        expiresAt: now + expiresIn,
      };
      LoggerUtil.log(
        `Keycloak admin token cached, expires in ${Math.floor(expiresIn / 1000)} seconds`
      );
    }

    return res;
  } catch (error) {
    // Clear cache on error to force refresh on next request
    cachedAdminToken = null;
    LoggerUtil.error(
      `${API_RESPONSES.SERVER_ERROR}`,
      `Error fetching Keycloak admin token: ${error.message}`
    );
    throw error;
  }
}

/**
 * Get Keycloak admin token with caching mechanism and request deduplication
 * 
 * Features:
 * - Token is cached and reused with adaptive buffer (20% of token lifetime or min 10 seconds)
 * - Request deduplication: Multiple concurrent requests share the same token fetch promise
 * - Prevents thundering herd problem under high load (e.g., 20k users)
 * - Automatically refreshes token before expiry
 * 
 * This significantly reduces load on Keycloak token endpoint, especially under high traffic.
 */
async function getKeycloakAdminToken(): Promise<any> {
  try {
    const now = Date.now();

    // Check if cached token is still valid
    if (cachedAdminToken) {
      const remainingTime = cachedAdminToken.expiresAt - now;
      
      // Calculate adaptive buffer: 20% of remaining time, minimum 10 seconds, maximum 60 seconds
      // This works for:
      // - 60-second tokens: 12-second buffer (cache used for ~48 seconds)
      // - 300-second tokens: 60-second buffer (cache used for ~240 seconds)
      const bufferTime = Math.min(
        Math.max(remainingTime * 0.2, 10 * 1000), // 20% of remaining, min 10 seconds
        60 * 1000 // max 60 seconds
      );
      
      if (remainingTime > bufferTime) {
        LoggerUtil.log(
          `Using cached Keycloak admin token (expires in ${Math.floor(remainingTime / 1000)} seconds, buffer: ${Math.floor(bufferTime / 1000)}s)`
        );
        return {
          data: {
            access_token: cachedAdminToken.token,
            expires_in: Math.floor(remainingTime / 1000),
          },
        };
      }
    }

    // If there's already a token fetch in progress, wait for it instead of creating a new one
    // This prevents thundering herd: 20k concurrent requests will share 1 token fetch
    if (tokenFetchPromise !== null) {
      LoggerUtil.log('Token fetch already in progress, waiting for existing request');
      return await tokenFetchPromise;
    }

    // Start new token fetch and store the promise for other concurrent requests
    LoggerUtil.log('Fetching new Keycloak admin token');
    tokenFetchPromise = fetchNewToken();

    try {
      const result = await tokenFetchPromise;
      return result;
    } finally {
      // Clear the promise after fetch completes (success or failure)
      // This allows future requests to fetch a new token if needed
      tokenFetchPromise = null;
    }
  } catch (error) {
    // Clear promise on error to allow retry
    tokenFetchPromise = null;
    LoggerUtil.error(
      `${API_RESPONSES.SERVER_ERROR}`,
      `Error in getKeycloakAdminToken: ${error.message}`
    );
    throw error;
  }
}

async function createUserInKeyCloak(query, token) {
  if (!query.password) {
    return 'User cannot be created, Password missing';
  }

  const data = JSON.stringify({
    firstName: query.firstName,
    lastName: query.lastName,
    email: query.email || null, // Use `||` for simpler null/undefined handling
    username: query.username,
    enabled: true, // Changed "true" (string) to true (boolean)
    credentials: [
      {
        temporary: false, // Changed "false" (string) to false (boolean)
        type: 'password',
        value: query.password,
      },
    ],
  });

  const config = {
    method: 'post',
    url: `${process.env.KEYCLOAK}${process.env.KEYCLOAK_ADMIN}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    data,
  };

  try {
    // Make the request and wait for the response
    const response = await axios(config);

    // Log and return the created user's ID
    const userId = response.headers.location.split('/').pop(); // Extract user ID from the location header
    return {
      statusCode: response.status,
      message: 'User created successfully',
      userId: userId,
    };
  } catch (error) {
    // Handle errors and log relevant details
    if (error.response) {
      console.error('Error Response Status:', error.response.status);
      console.error('Error Response Data:', error.response.data);
      console.error('Error Response Headers:', error.response.headers);

      return {
        statusCode: error.response.status,
        message:
          error.response.data.errorMessage ||
          'Error occurred during user creation',
        email: query.email || 'No email provided',
      };
    } else if (error.request) {
      console.error('No response received:', error.request);
      return {
        statusCode: 500,
        message: 'No response received from Keycloak',
        email: query.email || 'No email provided',
      };
    } else {
      console.error('Error setting up request:', error.message);
      return {
        statusCode: 500,
        message: `Error setting up request: ${error.message}`,
        email: query.email || 'No email provided',
      };
    }
  }
}

// Define the structure of the input query
interface UpdateUserQuery {
  userId: string; // Required
  firstName?: string; // Optional
  lastName?: string; // Optional
  username?: string; // Optional
  email?: string; // Optional
}

// Define the structure of the function response
interface UpdateUserResponse {
  success: boolean;
  statusCode: number;
  message: string;
}

async function updateUserInKeyCloak(
  query: UpdateUserQuery,
  token: string
): Promise<UpdateUserResponse> {
  // Validate required parameters
  if (!query.userId) {
    return {
      success: false,
      statusCode: 400,
      message: 'User cannot be updated, userId missing',
    };
  }

  // Prepare the payload for the update
  const data = JSON.stringify({
    enabled: true,
    ...(query.firstName && { firstName: query.firstName }),
    ...(query.lastName && { lastName: query.lastName }),
    ...(query.username && { username: query.username }),
    ...(query.email && { email: query.email }),
  });

  // Axios request configuration
  const config: AxiosRequestConfig = {
    method: 'put',
    url: `${process.env.KEYCLOAK}${process.env.KEYCLOAK_ADMIN}/${query.userId}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    data: data,
  };

  try {
    // Perform the Axios request
    const response: AxiosResponse = await axios(config);

    // Handle response status codes
    if (response.status === 204) {
      return {
        success: true,
        statusCode: response.status,
        message: 'User updated successfully in Keycloak',
      };
    } else {
      return {
        success: false,
        statusCode: response.status,
        message: `Unexpected response status: ${response.status}`,
      };
    }
  } catch (error: any) {
    // Extract error details
    const axiosError: AxiosError = error;
    const errorMessage =
      axiosError.response?.data?.errorMessage ||
      'Failed to update user in Keycloak';

    return {
      success: false,
      statusCode: axiosError.response?.status || 500,
      message: errorMessage,
    };
  }
}

async function checkIfEmailExistsInKeycloak(email, token) {
  const axios = require('axios');
  const config = {
    method: 'get',
    url: process.env.KEYCLOAK + process.env.KEYCLOAK_ADMIN + `?email=${email}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
  };

  let userResponse;
  try {
    userResponse = await axios(config);
  } catch (e) {
    LoggerUtil.error(
      `${API_RESPONSES.SERVER_ERROR}`,
      `Error: "Keycloak error - email" ${e.message},`
    );
    return e;
  }

  return userResponse;
}

async function checkIfUsernameExistsInKeycloak(username, token) {
  const axios = require('axios');
  const config = {
    method: 'get',
    url:
      process.env.KEYCLOAK +
      process.env.KEYCLOAK_ADMIN +
      `?username=${username}&exact=true`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
  };

  let userResponse;
  try {
    userResponse = await axios(config);
  } catch (e) {
    LoggerUtil.error(
      `${API_RESPONSES.SERVER_ERROR}`,
      `Error: "Keycloak error - username" ${e.message},`
    );
    return e;
  }

  return userResponse;
}

export {
  getUserGroup,
  getUserRole,
  getKeycloakAdminToken,
  clearCachedAdminToken,
  createUserInKeyCloak,
  updateUserInKeyCloak,
  checkIfEmailExistsInKeycloak,
  checkIfUsernameExistsInKeycloak,
};
