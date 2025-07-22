import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kafka, Producer, Admin } from "kafkajs";

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly kafka: Kafka;
  private producer: Producer;
  private admin: Admin;
  private readonly logger = new Logger(KafkaService.name);
  private isKafkaEnabled: boolean; // Flag to check if Kafka is enabled
  private topicsCreated: Set<string> = new Set(); // Track created topics

  constructor(private configService: ConfigService) {
    // Retrieve Kafka config from the configuration
    this.isKafkaEnabled = this.configService.get<boolean>(
      "kafkaEnabled",
      false,
    ); // Default to true if not specified
    const brokers = this.configService
      .get<string>("KAFKA_BROKERS", "localhost:9092")
      .split(",");
    const clientId = this.configService.get<string>(
      "KAFKA_CLIENT_ID",
      "user-service",
    );

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
        this.logger.log("Kafka producer and admin initialized successfully");
      } catch (error) {
        this.logger.error("Failed to initialize Kafka services", error);
      }
    } else {
      this.logger.log("Kafka is disabled. Skipping producer initialization.");
    }
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
      this.logger.log("Kafka producer connected");
    } catch (error) {
      this.logger.error(
        `Failed to connect Kafka producer: ${error.message}`,
        error.stack,
      );
      throw error; // Throwing error to indicate connection failure
    }
  }

  private async disconnectProducer() {
    try {
      await this.producer.disconnect();
      this.logger.log("Kafka producer disconnected");
    } catch (error) {
      this.logger.error(
        `Failed to disconnect Kafka producer: ${error.message}`,
        error.stack,
      );
    }
  }

  private async connectAdmin() {
    try {
      await this.admin.connect();
      this.logger.log("Kafka admin connected");
    } catch (error) {
      this.logger.error(
        `Failed to connect Kafka admin: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private async disconnectAdmin() {
    try {
      await this.admin.disconnect();
      this.logger.log("Kafka admin disconnected");
    } catch (error) {
      this.logger.error(
        `Failed to disconnect Kafka admin: ${error.message}`,
        error.stack,
      );
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
      if (error.message && error.message.includes("already exists")) {
        this.topicsCreated.add(topicName);
        this.logger.debug(`Topic ${topicName} already exists`);
        return;
      }

      this.logger.error(
        `Failed to ensure topic ${topicName} exists: ${error.message}`,
        error.stack,
      );
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
  async publishMessage(
    topic: string,
    message: any,
    key?: string,
  ): Promise<void> {
    if (!this.isKafkaEnabled) {
      this.logger.warn("Kafka is disabled. Skipping message publish.");
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
            value:
              typeof message === "string" ? message : JSON.stringify(message),
          },
        ],
      };

      await this.producer.send(payload);
      this.logger.debug(`Message published to topic: ${topic}`);
    } catch (error) {
      this.logger.error(
        `Failed to publish message to topic ${topic}: ${error.message}`,
        error.stack,
      );
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
  async publishUserEvent(
    eventType: "created" | "updated" | "deleted",
    userData: any,
    userId: string,
  ): Promise<void> {
    if (!this.isKafkaEnabled) {
      this.logger.warn("Kafka is disabled. Skipping user event publish.");
      return; // Do nothing if Kafka is disabled
    }

    const topic = this.configService.get<string>("KAFKA_TOPIC", "user-topic");
    let fullEventType = "";
    switch (eventType) {
      case "created":
        fullEventType = "USER_CREATED";
        break;
      case "updated":
        fullEventType = "USER_UPDATED";
        break;
      case "deleted":
        fullEventType = "USER_DELETED";
        break;
      default:
        fullEventType = "UNKNOWN_EVENT";
        break;
    }
    const payload = {
      eventType: fullEventType,
      timestamp: new Date().toISOString(),
      userId,
      data: userData,
    };

    await this.publishMessage(topic, payload, userId);
    this.logger.log(`User ${eventType} event published for user ${userId}`);
  }

  /**
   * Publish a cohort-related event to Kafka
   *
   * @param eventType - The type of cohort event (created, updatetrued, deleted)
   * @param cohortData - The cohort data to include in the event
   * @param cohortId - The ID of the cohort (used as the message key)
   */
  async publishCohortEvent(
    eventType: "created" | "updated" | "deleted",
    cohortData: any,
    cohortId: string,
  ): Promise<void> {
    if (!this.isKafkaEnabled) {
      this.logger.warn("Kafka is disabled. Skipping cohort event publish.");
      return; // Do nothing if Kafka is disabled
    }

    const topic = this.configService.get<string>("KAFKA_TOPIC", "user-topic");
    let fullEventType = "";
    switch (eventType) {
      case "created":
        fullEventType = "COHORT_CREATED";
        break;
      case "updated":
        fullEventType = "COHORT_UPDATED";
        break;
      case "deleted":
        fullEventType = "COHORT_DELETED";
        break;
      default:
        fullEventType = "UNKNOWN_EVENT";
        break;
    }
    const payload = {
      eventType: fullEventType,
      timestamp: new Date().toISOString(),
      cohortId,
      data: cohortData,
    };

    await this.publishMessage(topic, payload, cohortId);
    this.logger.log(
      `Cohort ${eventType} event published for cohort ${cohortId}`,
    );
  }
}
