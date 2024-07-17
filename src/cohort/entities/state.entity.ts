import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
  } from "typeorm";
  
  @Entity({ name: "states" })
  export class State {
    @PrimaryGeneratedColumn('uuid')  
    value: string;
  
    @Column({ nullable: true })
    name: string;
  
   }
  