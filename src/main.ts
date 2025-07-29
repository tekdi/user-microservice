// import { NestFactory } from "@nestjs/core";
// import { AppModule } from "./app.module";
// import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
// import { RequestMethod } from "@nestjs/common";
// import { join } from "path";
// import express = require("express");
// async function bootstrap() {
//   const app = await NestFactory.create(AppModule);
//   app.use(
//     process.env.IMAGEPATH,
//     express.static(join(__dirname, "..", "uploads"))
//   );
//   app.setGlobalPrefix("api/v1", {
//     exclude: [{ path: "health", method: RequestMethod.GET }],
//   });

//   // const config = new DocumentBuilder()
//   //   .setTitle("Shiksha Platform")
//   //   .setDescription("CRUD API")
//   //   .setVersion("1.0")
//   //   .addTag("V1")
//   //   .addApiKey(
//   //     { type: "apiKey", scheme: "bearer",  bearerFormat: "JWT", name: "Authorization", in: "header" },
//   //     "access-token"
//   //   ).build();
//   // const document = SwaggerModule.createDocument(app, config);
//   // SwaggerModule.setup("api/swagger-docs", app, document);
//   app.enableCors();
//   await app.listen(3000);
// }
// bootstrap();
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { RequestMethod, ValidationPipe } from "@nestjs/common";
import { join } from "path";
import express = require("express");
import { AllExceptionsFilter } from "./common/filters/exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    process.env.IMAGEPATH,
    express.static(join(__dirname, "..", "uploads"))
  );
  app.setGlobalPrefix("user/v1", {
    exclude: [{ path: "health", method: RequestMethod.GET }],
  });

  // app.useGlobalPipes(
  //   new ValidationPipe({
  //     whitelist: true,
  //     forbidNonWhitelisted: true,
  //     transform: true,
  //   }),
  // );

  const config = new DocumentBuilder()
    .setTitle("Shiksha Platform")
    .setDescription("CRUD API")
    .setVersion("1.0")
    .addTag("V1")
    .addApiKey(
      { type: "apiKey", name: "Authorization", in: "header" },
      "access-token"
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("swagger-docs", app, document);
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();
  await app.listen(3000);
}
bootstrap();
