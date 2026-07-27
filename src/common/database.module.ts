import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "src/user/entities/user-entity";
import { AuditLog, MessageTemplate } from "@tekdi/audit-logger";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: "postgres",
        host: configService.get("POSTGRES_HOST"),
        port: configService.get("POSTGRES_PORT"),
        database: configService.get("POSTGRES_DATABASE"),
        username: configService.get("POSTGRES_USERNAME"),
        password: configService.get("POSTGRES_PASSWORD"),
        entities: [AuditLog, MessageTemplate], // To support consume message by audit-logger
        autoLoadEntities: true,
        extra: {
          max: 20, // Number of connections in the pool (default is 10)
          idleTimeoutMillis: 30000, // 30 seconds
          connectionTimeoutMillis: 2000, // 2 seconds max to wait for a free connection
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [ConfigService],
})
export class DatabaseModule {}
