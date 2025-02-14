import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
  ) {}

  async create(dto: CreateAutomaticMemberDto) {
    try {
      const checkExistUser = await this.userRepository.find({
        where: {
          userId: dto.userId,
        },
      });
      if (checkExistUser) {
        throw new ConflictException('User id is not Valid.');
      }
      const exists = await this.automaticMemberRepository.findOne({
        where: { userId: dto.userId, tenantId: dto.tenantId},
      });
      if (exists) {
        throw new ConflictException('AutomaticMember already exists for this user and tenant.');
      }
      const newMember = this.automaticMemberRepository.create(dto);
      return this.automaticMemberRepository.save(newMember);
    } catch (error) {
      return error
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
    const member = await this.automaticMemberRepository.findOne({ where: { userId:id } });
    
    if (!member) {
      throw new NotFoundException(`AutomaticMember with ID ${id} not found`);
    }
  
    return member;
  }
  async update(id: string, dto: UpdateAutomaticMemberDto) {
    const member = await this.findOne(id);
    if(!member){
        throw new NotFoundException(`AutomaticMember with ID ${id} not found`); 
    }
    Object.assign(member, dto);
    return this.automaticMemberRepository.save(member);
  }

  async remove(id: string) {
    const member = await this.findOne(id);
    await this.automaticMemberRepository.remove(member);
    return { message: 'AutomaticMember deleted successfully' };
  }
}
