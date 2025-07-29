import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AutomaticMember } from "./entity/automatic-member.entity";
import { AutomaticMemberService } from "./automatic-member.service";
import { AutomaticMemberController } from "./automatic-member.controller";
import { User } from "src/user/entities/user-entity";

@Module({
  imports: [TypeOrmModule.forFeature([AutomaticMember, User])],
  controllers: [AutomaticMemberController],
  providers: [AutomaticMemberService],
  exports: [AutomaticMemberService],
})
export class AutomaticMemberModule {}
