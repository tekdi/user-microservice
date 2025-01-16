import { API_RESPONSES } from "./response.messages";
import { LoggerUtil } from "src/common/logger/LoggerUtil";
const axios = require("axios");

function getUserRole(userRoles: string[]) {
  if (userRoles.includes("systemAdmin")) {
    return "systemAdmin";
  } else if (userRoles.includes("facilitator")) {
    return "facilitator";
  } else if (userRoles.includes("beneficiary")) {
    return "beneficiary";
  } else return "user";
}

function getUserGroup(role: string) {
  switch (role) {
    case "systemAdmin":
      return "systemAdmin";
    case "facilitator":
      return "facilitator";
    default:
      return "beneficiary";
  }
}

async function getKeycloakAdminToken() {
  const axios = require("axios");
  const qs = require("qs");
  const data = qs.stringify({
    username: process.env.KEYCLOAK_USERNAME,
    password: process.env.KEYCLOAK_PASSWORD,
    grant_type: "password",
    client_id: "admin-cli",
  });

  const config = {
    method: "post",
    url: process.env.KEYCLOAK + process.env.KEYCLOAK_ADMIN_TOKEN,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    data: data,
  };

  let res;
  try {
    res = await axios(config);
  } catch (error) {
    LoggerUtil.error(
      `${API_RESPONSES.SERVER_ERROR}`,
      `Error: ${error.message},`
    )
  }

  return res;
}


async function createUserInKeyCloak(query, token) {
  if (!query.password) {
    return "User cannot be created, Password missing";
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
        type: "password",
        value: query.password,
      },
    ],
  });

  const config = {
    method: "post",
    url: `${process.env.KEYCLOAK}${process.env.KEYCLOAK_ADMIN}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    data,
  };

  try {
    // Make the request and wait for the response
    const response = await axios(config);

    // Log and return the created user's ID
    const userId = response.headers.location.split("/").pop(); // Extract user ID from the location header
    return { statusCode: response.status, message: "User created successfully", userId : userId };
  } catch (error) {
    // Handle errors and log relevant details
    if (error.response) {
      console.error("Error Response Status:", error.response.status);
      console.error("Error Response Data:", error.response.data);
      console.error("Error Response Headers:", error.response.headers);

      return {
        statusCode: error.response.status,
        message: error.response.data.errorMessage || "Error occurred during user creation",
        email: query.email || "No email provided",
      };
    } else if (error.request) {
      console.error("No response received:", error.request);
      return {
        statusCode: 500,
        message: "No response received from Keycloak",
        email: query.email || "No email provided",
      };
    } else {
      console.error("Error setting up request:", error.message);
      return {
        statusCode: 500,
        message: `Error setting up request: ${error.message}`,
        email: query.email || "No email provided",
      };
    }
  }
}


async function updateUserInKeyCloak(query, token) {  

  const axios = require("axios");

  // Validate required parameters
  if (!query.userId) {
    return "User cannot be updated, userId missing";
  }
  
  // Prepare data payload
  const data = JSON.stringify({
    enabled: query.enabled !== undefined ? query.enabled : true, // Default to enabled if not specified
    ...(query.firstName && { firstName: query.firstName }),
    ...(query.lastName && { lastName: query.lastName }),
    ...(query.username && { username: query.username }),
    ...(query.email && { email: query.email }),

  });
  
  const config = {
    method: "put",
    url: `${process.env.KEYCLOAK}${process.env.KEYCLOAK_ADMIN}/${query.userId}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    data: data,
  };

  try {
    const response = await axios(config);
    if(response.status === 204) {
      return true;
    }else{
      return false;
    }
  } catch (error) {
    const errorMessage = error.response?.data?.errorMessage || "Failed to update user in Keycloak"; 

    LoggerUtil.error(
      `${API_RESPONSES.SERVER_ERROR}`,
      `Error: ${error.message},`
    )
    return errorMessage;
  }
}


async function checkIfEmailExistsInKeycloak(email, token) {
  const axios = require("axios");
  const config = {
    method: "get",
    url: process.env.KEYCLOAK + process.env.KEYCLOAK_ADMIN + `?email=${email}`,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
  };

  let userResponse;
  try {
    userResponse = await axios(config);
  } catch (e) {
    LoggerUtil.error(
      `${API_RESPONSES.SERVER_ERROR}`,
      `Error: "Keycloak error - email" ${e.message},`
    )
    return e;
  }

  return userResponse;
}

async function checkIfUsernameExistsInKeycloak(username, token) {
  const axios = require("axios");
  const config = {
    method: "get",
    url:
      process.env.KEYCLOAK +
      process.env.KEYCLOAK_ADMIN +
      `?username=${username}&exact=true`,
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
  };

  let userResponse;
  try {
    userResponse = await axios(config);
  } catch (e) {
    LoggerUtil.error(
      `${API_RESPONSES.SERVER_ERROR}`,
      `Error: "Keycloak error - username" ${e.message},`
    )
    return e;
  }

  return userResponse;
}

export {
  getUserGroup,
  getUserRole,
  getKeycloakAdminToken,
  createUserInKeyCloak,
  updateUserInKeyCloak,
  checkIfEmailExistsInKeycloak,
  checkIfUsernameExistsInKeycloak,
};
