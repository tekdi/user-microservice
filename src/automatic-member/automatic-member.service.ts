import { Injectable, NotFoundException, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AutomaticMember } from './entity/automatic-member.entity';
import { CreateAutomaticMemberDto } from './dto/create-automatic-member.dto';
import { UpdateAutomaticMemberDto } from './dto/update-automatic-member.dto';
import { User } from 'src/user/entities/user-entity';

@Injectable()
export class AutomaticMemberService {
  constructor(
    @InjectRepository(AutomaticMember)
    private automaticMemberRepository: Repository<AutomaticMember>,
    @InjectRepository(User)
    private userRepository: Repository<User>
  ) { }

  async create(dto: CreateAutomaticMemberDto) {
    try {
      const checkExistUser = await this.userRepository.findOne({
        where: {
          userId: dto.userId,
        },
      });

      if (!checkExistUser) {
        throw new ConflictException('User id is not Valid.');
      }

      const exists = await this.checkAutomaticMemberExists(dto.userId, dto.tenantId, dto.rules.condition.value[0]);
      if (exists.length > 0 && exists[0].isActive === true) {
        throw new ConflictException('AutomaticMember already exists for this user and tenant.');
      }

      const newMember = this.automaticMemberRepository.create(dto);
      return this.automaticMemberRepository.save(newMember);
    } catch (error) {
      console.log(error);
      throw new InternalServerErrorException('Failed to create automatic member.');
    }
  }

  async findAll() {
    return this.automaticMemberRepository.find();
  }

  async findOne(id: string) {
    const member = await this.automaticMemberRepository.findOne({ where: { id } });

    if (!member) {
      throw new NotFoundException(`AutomaticMember with ID ${id} not found`);
    }

    return {
      ...member,
      status: member.isActive ? 'Active' : 'Inactive',
    };
  }

  async checkMemberById(id: string) {
    const member = await this.automaticMemberRepository.findOne({ where: { userId: id, isActive: true } });


    if (!member) {
      return false;
    }

    return member;
  }

  async checkAutomaticMemberExists(userId: string, tenantId: string, assignTo: string) {
    const query = `
    SELECT * FROM "AutomaticMember" "automaticMember"
    WHERE "automaticMember"."userId" = $1
    AND "automaticMember"."tenantId" = $2
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text("automaticMember"."rules"::jsonb -> 'condition' -> 'value') AS val
      WHERE val = $3
    )
  `;
    return await this.automaticMemberRepository.query(query, [
      userId,
      tenantId,
      assignTo.toString()
    ]);
  }

  async getUserbyUserIdAndTenantId(userId: string, tenantId: string, status: boolean): Promise<AutomaticMember> {
    return await this.automaticMemberRepository.findOne({
      where: { userId: userId, tenantId: tenantId, isActive: status },
    });
  }
  async update(id: string, dto: UpdateAutomaticMemberDto) {
    const member = await this.findOne(id);
    if (!member) {
      throw new NotFoundException(`AutomaticMember with ID ${id} not found`);
    }

    Object.assign(member)
    Object.assign(member, dto);
    return this.automaticMemberRepository.save(member);
  }

  async remove(id: string) {
    const member = await this.findOne(id);
    await this.automaticMemberRepository.remove(member);
    return { message: 'AutomaticMember deleted successfully' };
  }
}
