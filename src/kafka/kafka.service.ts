import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Admin } from 'kafkajs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldValues } from '../fields/entities/fields-values.entity';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private producer: Producer;
  private admin: Admin;
  private readonly logger = new Logger(KafkaService.name);
  private isKafkaEnabled: boolean; // Flag to check if Kafka is enabled
  private topicsCreated: Set<string> = new Set(); // Track created topics
  
  // Constants for TYPE_OF_CENTER field transformation
  private readonly TYPE_OF_CENTER_FIELD_ID = '000a7469-2721-4c7b-8180-52812a0f6fe7';
  private readonly TYPE_MAPPINGS = {
    COHORT: {
      regular: 'regularCenter',
      remote: 'remoteCenter'
    },
    BATCH: {
      regular: 'regularBatch', 
      remote: 'remoteBatch'
    }
  } as const;

  constructor(
    private configService: ConfigService,
    @InjectRepository(FieldValues)
    private fieldValuesRepository: Repository<FieldValues>
  ) {
    // Retrieve Kafka config from the configuration
    this.isKafkaEnabled = this.configService.get<boolean>('kafkaEnabled', false); // Default to true if not specified
    const brokers = this.configService.get<string>('KAFKA_BROKERS', 'localhost:9092').split(',');
    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'user-service');

    // Initialize Kafka client if enabled
    if (this.isKafkaEnabled) {
      this.kafka = new Kafka({
        clientId,
        brokers,
        retry: {
          initialRetryTime: 100,
          retries: 8, // You can configure retries here
        },
      });

      this.producer = this.kafka.producer();
      this.admin = this.kafka.admin();
    }
  }

  async onModuleInit() {
    if (this.isKafkaEnabled) {
      try {
        await this.connectAdmin();
        await this.connectProducer();
        this.logger.log('Kafka producer and admin initialized successfully');
      } catch (error) {
        this.logger.error('Failed to initialize Kafka services', error);
      }
    } else {
      this.logger.log('Kafka is disabled. Skipping producer initialization.');
    }
  }

  /**
   * Extract TYPE_OF_CENTER value from customFields array
   * @param customFields - Array of custom field objects with fieldId and selectedValues
   * @returns The TYPE_OF_CENTER value ('regular' or 'remote') or null
   */
  private extractTypeOfCenter(customFields: any[]): string | null {
    if (!customFields || !Array.isArray(customFields)) {
      return null;
    }

    const typeOfCenterField = customFields.find(
      field => field.fieldId === this.TYPE_OF_CENTER_FIELD_ID
    );

    if (!typeOfCenterField) {
      return null;
    }

    // Handle different customField structures
    let value: string | null = null;

    // First try selectedValues structure (from cohort creation)
    if (typeOfCenterField.selectedValues && Array.isArray(typeOfCenterField.selectedValues)) {
      const selectedValue = typeOfCenterField.selectedValues[0];
      if (selectedValue) {
        value = selectedValue.value || selectedValue.id || selectedValue;
      }
    }
    // Fallback to direct value property (from field values table)
    else if (typeOfCenterField.value) {
      value = Array.isArray(typeOfCenterField.value) 
        ? typeOfCenterField.value[0] 
        : typeOfCenterField.value;
    }

    return value?.toString().toLowerCase() || null;
  }

  /**
   * Query TYPE_OF_CENTER value from FieldValues table for a cohort
   * @param cohortId - The cohort ID to query
   * @returns The TYPE_OF_CENTER value ('regular' or 'remote') or null
   */
  private async queryTypeOfCenter(cohortId: string): Promise<string | null> {
    try {
      const fieldValue = await this.fieldValuesRepository.findOne({
        where: {
          itemId: cohortId,
          fieldId: this.TYPE_OF_CENTER_FIELD_ID
        }
      });

      if (!fieldValue || !fieldValue.value) {
        return null;
      }

      // Handle text[] array from database
      const value = Array.isArray(fieldValue.value) 
        ? fieldValue.value[0] 
        : fieldValue.value;

      return value?.toString().toLowerCase() || null;
    } catch (error) {
      this.logger.error(`Failed to query TYPE_OF_CENTER for cohort ${cohortId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Transform cohort type based on TYPE_OF_CENTER value
   * @param cohortType - The cohort type ('COHORT' or 'BATCH')
   * @param typeOfCenter - The TYPE_OF_CENTER value ('regular' or 'remote')
   * @returns Transformed type (e.g., 'regularCenter', 'remoteCenter', 'regularBatch', 'remoteBatch')
   */
  private transformCohortType(cohortType: 'COHORT' | 'BATCH', typeOfCenter: string | null): string {
    if (!typeOfCenter || !(cohortType in this.TYPE_MAPPINGS) || !(typeOfCenter in this.TYPE_MAPPINGS[cohortType])) {
      // Fallback to original type if transformation not possible
      return cohortType;
    }

    return this.TYPE_MAPPINGS[cohortType][typeOfCenter];
  }

  async onModuleDestroy() {
    if (this.isKafkaEnabled) {
      await this.disconnectProducer();
      await this.disconnectAdmin();
    }
  }

  private async connectProducer() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected');
    } catch (error) {
      this.logger.error(`Failed to connect Kafka producer: ${error.message}`, error.stack);
      throw error; // Throwing error to indicate connection failure
    }
  }

  private async disconnectProducer() {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    } catch (error) {
      this.logger.error(`Failed to disconnect Kafka producer: ${error.message}`, error.stack);
    }
  }

  private async connectAdmin() {
    try {
      await this.admin.connect();
      this.logger.log('Kafka admin connected');
    } catch (error) {
      this.logger.error(`Failed to connect Kafka admin: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async disconnectAdmin() {
    try {
      await this.admin.disconnect();
      this.logger.log('Kafka admin disconnected');
    } catch (error) {
      this.logger.error(`Failed to disconnect Kafka admin: ${error.message}`, error.stack);
    }
  }

  /**
   * Ensure a topic exists, creating it if necessary
   * 
   * @param topicName - The name of the topic to ensure exists
   * @returns A promise that resolves when the topic is confirmed to exist
   */
  private async ensureTopicExists(topicName: string): Promise<void> {
    if (!this.isKafkaEnabled) {
      return;
    }

    // Check if we've already created this topic in this session
    if (this.topicsCreated.has(topicName)) {
      return;
    }

    try {
      // Get list of existing topics
      const existingTopics = await this.admin.listTopics();
      
      // Check if topic exists
      if (existingTopics.includes(topicName)) {
        this.topicsCreated.add(topicName);
        this.logger.debug(`Topic ${topicName} already exists`);
        return;
      }

      // Create the topic if it doesn't exist
      await this.admin.createTopics({
        topics: [
          {
            topic: topicName,
            numPartitions: 1, // You can make this configurable
            replicationFactor: 1, // You can make this configurable
          },
        ],
      });

      this.topicsCreated.add(topicName);
      this.logger.log(`Topic ${topicName} created successfully`);
    } catch (error) {
      // Topic might already exist, check if it's a "topic already exists" error
      if (error.message && error.message.includes('already exists')) {
        this.topicsCreated.add(topicName);
        this.logger.debug(`Topic ${topicName} already exists`);
        return;
      }
      
      this.logger.error(`Failed to ensure topic ${topicName} exists: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Publish a message to a Kafka topic
   * 
   * @param topic - The Kafka topic to publish to
   * @param message - The message payload to publish
   * @param key - Optional message key for partitioning
   * @returns A promise that resolves when the message is sent
   */
  async publishMessage(topic: string, message: any, key?: string): Promise<void> {
    if (!this.isKafkaEnabled) {
      this.logger.warn('Kafka is disabled. Skipping message publish.');
      return; // Do nothing if Kafka is disabled
    }

    try {
      // Ensure the topic exists before publishing
      await this.ensureTopicExists(topic);

      const payload = {
        topic,
        messages: [
          {
            key: key || undefined,
            value: typeof message === 'string' ? message : JSON.stringify(message),
          },
        ],
      };

      await this.producer.send(payload);
      this.logger.debug(`Message published to topic: ${topic}`);
    } catch (error) {
      this.logger.error(`Failed to publish message to topic ${topic}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Publish a user-related event to Kafka
   * 
   * @param eventType - The type of user event (created, updated, deleted, login)
   * @param userData - The user data to include in the event
   * @param userId - The ID of the user (used as the message key)
   */
  async publishUserEvent(eventType: 'created' | 'updated' | 'deleted' | 'login', userData: any, userId: string): Promise<void> {
    if (!this.isKafkaEnabled) {
      this.logger.warn('Kafka is disabled. Skipping user event publish.');
      return; // Do nothing if Kafka is disabled
    }

    const topic = this.configService.get<string>('KAFKA_TOPIC', 'user-topic');
    let fullEventType = '';
    switch (eventType) {
      case 'created':
        fullEventType = 'USER_CREATED';
        break;
      case 'updated':
        fullEventType = 'USER_UPDATED';
        break;
      case 'deleted':
        fullEventType = 'USER_DELETED';
        break;
      case 'login':
        fullEventType = 'USER_LOGIN';
        break;
      default:
        fullEventType = 'UNKNOWN_EVENT';
        break;
    }
    const payload = {
      eventType: fullEventType,
      timestamp: new Date().toISOString(),
      userId,
      data: userData
    };

    await this.publishMessage(topic, payload, userId);
    this.logger.log(`User ${eventType} event published for user ${userId}`);
  }

  /**
   * Publish a cohort-related event to Kafka with TYPE_OF_CENTER transformation
   * 
   * @param eventType - The type of cohort event (created, updated, deleted)
   * @param cohortData - The cohort data to include in the event
   * @param cohortId - The ID of the cohort (used as the message key)
   */
  async publishCohortEvent(eventType: 'created' | 'updated' | 'deleted', cohortData: any, cohortId: string): Promise<void> {
    if (!this.isKafkaEnabled) {
      this.logger.warn('Kafka is disabled. Skipping cohort event publish.');
      return; // Do nothing if Kafka is disabled
    }

    const topic = this.configService.get<string>('KAFKA_TOPIC', 'user-topic');
    
    // Keep original eventType format
    let fullEventType = '';
    switch (eventType) {
      case 'created':
        fullEventType = 'COHORT_CREATED';
        break;
      case 'updated':
        fullEventType = 'COHORT_UPDATED';
        break;
      case 'deleted':
        fullEventType = 'COHORT_DELETED';
        break;
      default:
        fullEventType = 'UNKNOWN_EVENT';
        break;
    }

    // Clone cohortData to avoid modifying the original
    const transformedCohortData = { ...cohortData };

    try {
      // Determine the cohort type from the data
      const cohortType = cohortData?.type?.toUpperCase();
      let typeOfCenter: string | null = null;

      if (cohortType === 'COHORT') {
        // For COHORT events: Extract TYPE_OF_CENTER from customFields directly
        this.logger.debug(`COHORT event - customFields structure:`, JSON.stringify(cohortData?.customFields || [], null, 2));
        typeOfCenter = this.extractTypeOfCenter(cohortData?.customFields || []);
        this.logger.log(`COHORT event - TYPE_OF_CENTER extracted: ${typeOfCenter}`);
      } else if (cohortType === 'BATCH') {
        // For BATCH events: Query TYPE_OF_CENTER using parentId as cohortId
        const parentCohortId = cohortData?.parentId;
        if (parentCohortId) {
          typeOfCenter = await this.queryTypeOfCenter(parentCohortId);
          this.logger.debug(`BATCH event - TYPE_OF_CENTER queried for parent cohort ${parentCohortId}: ${typeOfCenter}`);
        } else {
          this.logger.warn(`BATCH event missing parentId for cohort ${cohortId}`);
        }
      }

      // Transform the type field in data based on TYPE_OF_CENTER
      if (cohortType && (cohortType === 'COHORT' || cohortType === 'BATCH')) {
        const originalType = transformedCohortData.type;
        transformedCohortData.type = this.transformCohortType(cohortType as 'COHORT' | 'BATCH', typeOfCenter);
        this.logger.log(`Cohort type transformation - Original: ${originalType}, TYPE_OF_CENTER: ${typeOfCenter}, Transformed: ${transformedCohortData.type}`);
      } else {
        this.logger.warn(`Unknown cohort type: ${cohortType}, keeping original type`);
      }
    } catch (error) {
      // Keep original cohort type if transformation fails
      this.logger.error(`Failed to transform cohort type for cohort ${cohortId}: ${error.message}`);
    }

    const payload = {
      eventType: fullEventType,
      timestamp: new Date().toISOString(),
      cohortId,
      data: transformedCohortData
    };

    await this.publishMessage(topic, payload, cohortId);
    this.logger.log(`Cohort ${eventType} event published for cohort ${cohortId} with type: ${transformedCohortData.type}`);
  }
}
