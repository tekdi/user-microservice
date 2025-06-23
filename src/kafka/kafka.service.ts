import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Admin } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private producer: Producer;
  private admin: Admin;
  private readonly logger = new Logger(KafkaService.name);
  private isKafkaEnabled: boolean; // Flag to check if Kafka is enabled
  private readonly kafkaTopic: string;

  constructor(private configService: ConfigService) {
    // Retrieve Kafka config from the configuration
    this.isKafkaEnabled = this.configService.get<boolean>('kafkaEnabled', true); // Default to true if not specified
    const brokers = this.configService.get<string>('KAFKA_BROKERS', 'localhost:9092').split(',');
    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'user-service');
    this.kafkaTopic = this.configService.get<string>('KAFKA_TOPIC', 'user-topic');

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
        await this.ensureTopicExists();
        await this.connectProducer();
        this.logger.log('Kafka producer initialized successfully');
      } catch (error) {
        this.logger.error('Failed to initialize Kafka producer', error);
      }
    } else {
      this.logger.log('Kafka is disabled. Skipping producer initialization.');
    }
  }

  async onModuleDestroy() {
    if (this.isKafkaEnabled) {
      await this.disconnectProducer();
      await this.disconnectAdmin();
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

  private async ensureTopicExists() {
    try {
      // Check if topic exists
      const existingTopics = await this.admin.listTopics();
      
      if (!existingTopics.includes(this.kafkaTopic)) {
        this.logger.log(`Topic '${this.kafkaTopic}' does not exist. Creating...`);
        
        // Create the topic
        await this.admin.createTopics({
          topics: [
            {
              topic: this.kafkaTopic,
              numPartitions: this.configService.get<number>('KAFKA_TOPIC_PARTITIONS', 3),
              replicationFactor: this.configService.get<number>('KAFKA_TOPIC_REPLICATION_FACTOR', 1),
              configEntries: [
                {
                  name: 'cleanup.policy',
                  value: 'compact'
                },
                {
                  name: 'retention.ms',
                  value: this.configService.get<string>('KAFKA_TOPIC_RETENTION_MS', '604800000') // 7 days default
                }
              ]
            }
          ],
        });
        
        this.logger.log(`Topic '${this.kafkaTopic}' created successfully`);
      } else {
        this.logger.log(`Topic '${this.kafkaTopic}' already exists`);
      }
    } catch (error) {
      this.logger.error(`Failed to ensure topic exists: ${error.message}`, error.stack);
      throw error;
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
   * @param eventType - The type of user event (created, updated, deleted)
   * @param userData - The user data to include in the event
   * @param userId - The ID of the user (used as the message key)
   */
  async publishUserEvent(eventType: 'created' | 'updated' | 'deleted', userData: any, userId: string): Promise<void> {
    if (!this.isKafkaEnabled) {
      this.logger.warn('Kafka is disabled. Skipping user event publish.');
      return; // Do nothing if Kafka is disabled
    }

    const topic = this.kafkaTopic; // Use the configured topic
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
}
