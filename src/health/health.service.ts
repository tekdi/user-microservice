import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import axios, { AxiosError } from 'axios';

interface ServiceHealth {
  name: string;
  status: 'up' | 'down';
  message?: string;
  responseTime?: number;
}

@Injectable()
export class HealthService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async checkDatabase(): Promise<ServiceHealth> {
    const startTime = Date.now();
    try {
      if (!this.dataSource) {
        return { name: 'database', status: 'down', message: 'DataSource not available' };
      }

      if (!this.dataSource.isInitialized) {
        return { name: 'database', status: 'down', message: 'Database connection not initialized' };
      }

      const queryPromise = this.dataSource.query('SELECT 1');
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Database query timeout after 5 seconds')), 5000),
      );

      await Promise.race([queryPromise, timeoutPromise]);
      const responseTime = Date.now() - startTime;
      return { name: 'database', status: 'up', responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'database',
        status: 'down',
        message: error instanceof Error ? error.message : 'Database connection failed',
        responseTime,
      };
    }
  }

  async checkKeycloak(): Promise<ServiceHealth> {
    const startTime = Date.now();
    const keycloakUrl = this.configService.get<string>('KEYCLOAK');
    
    if (!keycloakUrl) {
      return { name: 'keycloak', status: 'down', message: 'Keycloak URL not configured' };
    }

    try {
      // Try to reach Keycloak health endpoint or base URL
      const healthUrl = `${keycloakUrl}/health` || `${keycloakUrl}/realms/master`;
      const timeout = 3000;

      await axios.get(healthUrl, {
        timeout,
        validateStatus: (status) => status < 500,
      });

      const responseTime = Date.now() - startTime;
      return { name: 'keycloak', status: 'up', responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          return { name: 'keycloak', status: 'down', message: 'Keycloak unreachable', responseTime };
        }
      }
      return {
        name: 'keycloak',
        status: 'down',
        message: error instanceof Error ? error.message : 'Keycloak check failed',
        responseTime,
      };
    }
  }

  async checkElasticsearch(): Promise<ServiceHealth> {
    const startTime = Date.now();
    const elasticsearchUrl = this.configService.get<string>('ELASTICSEARCH_HOST') || 'http://localhost:9200';
    
    try {
      const timeout = 3000;
      const response = await axios.get(`${elasticsearchUrl}/_cluster/health`, {
        timeout,
        validateStatus: (status) => status < 500,
      });

      const responseTime = Date.now() - startTime;
      
      if (response.status === 200) {
        const clusterStatus = response.data?.status;
        return {
          name: 'elasticsearch',
          status: clusterStatus === 'green' || clusterStatus === 'yellow' ? 'up' : 'down',
          message: clusterStatus === 'red' ? 'Elasticsearch cluster is red' : undefined,
          responseTime,
        };
      }

      return { name: 'elasticsearch', status: 'down', message: 'Elasticsearch unhealthy', responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          return { name: 'elasticsearch', status: 'down', message: 'Elasticsearch unreachable', responseTime };
        }
      }
      return {
        name: 'elasticsearch',
        status: 'down',
        message: error instanceof Error ? error.message : 'Elasticsearch check failed',
        responseTime,
      };
    }
  }

  async checkExternalService(serviceName: string, serviceUrl: string | undefined): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    if (!serviceUrl) {
      return { name: serviceName, status: 'down', message: 'Service URL not configured' };
    }

    try {
      // Try to check health endpoint first, fallback to base URL
      const timeout = 3000;
      let healthUrl = `${serviceUrl}/health/ready`;
      let response;

      try {
        response = await axios.get(healthUrl, {
          timeout,
          validateStatus: (status) => status < 500,
        });
      } catch {
        // If /health/ready fails, try /health
        try {
          healthUrl = `${serviceUrl}/health`;
          response = await axios.get(healthUrl, {
            timeout,
            validateStatus: (status) => status < 500,
          });
        } catch {
          // If health endpoints don't exist, try base URL connectivity
          await axios.get(serviceUrl, { timeout, validateStatus: () => true });
          return { name: serviceName, status: 'up', responseTime: Date.now() - startTime };
        }
      }

      const responseTime = Date.now() - startTime;
      
      if (response.status === 200 || response.status === 503) {
        return {
          name: serviceName,
          status: response.status === 200 ? 'up' : 'down',
          message: response.status === 503 ? 'Service unhealthy' : undefined,
          responseTime,
        };
      }

      // Other status codes - service is reachable
      return { name: serviceName, status: 'up', responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.code === 'ECONNREFUSED' || axiosError.code === 'ETIMEDOUT') {
          return { name: serviceName, status: 'down', message: 'Service unreachable', responseTime };
        }
      }
      return {
        name: serviceName,
        status: 'down',
        message: error instanceof Error ? error.message : 'Service check failed',
        responseTime,
      };
    }
  }

  async checkAllServices(): Promise<ServiceHealth[]> {
    const services: Array<{ name: string; url: string | undefined }> = [
      { name: 'lms-service', url: this.configService.get<string>('LMS_SERVICE_URL') },
      { name: 'aspire-specific-service', url: this.configService.get<string>('ASPIRE_SPECIFIC_SERVICE_URL') },
    ];

    // Check all services in parallel
    const serviceChecks = await Promise.allSettled(
      services.map((service) => this.checkExternalService(service.name, service.url))
    );

    return serviceChecks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        name: services[index].name,
        status: 'down' as const,
        message: result.reason?.message || 'Service check failed',
      };
    });
  }

  async getOverallHealth(): Promise<{
    status: 'ok' | 'error';
    timestamp: string;
    services: ServiceHealth[];
  }> {
    const dbHealth = await this.checkDatabase();
    const keycloakHealth = await this.checkKeycloak();
    const elasticsearchHealth = await this.checkElasticsearch();
    const externalServices = await this.checkAllServices();
    
    const allServices = [dbHealth, keycloakHealth, elasticsearchHealth, ...externalServices];
    const allHealthy = allServices.every((service) => service.status === 'up');

    return {
      status: allHealthy ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      services: allServices,
    };
  }
}

