// config/kafka.config.ts
export default () => ({
    kafkaEnabled: process.env.KAFKA_ENABLED === 'true', 
    kafkaHost: process.env.KAFKA_HOST || 'localhost:9092', 
  });
  