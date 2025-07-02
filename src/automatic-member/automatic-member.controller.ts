import { Controller, Get, Post, Body, Patch, Param, Delete, UsePipes, ValidationPipe } from '@nestjs/common';
import { AutomaticMemberService } from './automatic-member.service';
import { CreateAutomaticMemberDto } from './dto/create-automatic-member.dto';
import { UpdateAutomaticMemberDto } from './dto/update-automatic-member.dto';

@Controller('automaticMember')
export class AutomaticMemberController {
  constructor(private readonly automaticMemberService: AutomaticMemberService) {}

  @Post()
  @UsePipes(new ValidationPipe()) 
  create(@Body() createDto: CreateAutomaticMemberDto) {
    return this.automaticMemberService.create(createDto);
  }

  @Get()
  findAll() {
    return this.automaticMemberService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.automaticMemberService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateAutomaticMemberDto) {
    return this.automaticMemberService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.automaticMemberService.remove(id);
  }
}
