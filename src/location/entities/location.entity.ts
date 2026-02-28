import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

@Entity({ name: "location" })
export class Location {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar", length: 50, nullable: false })
  code: string;

  @Column({ type: "varchar", length: 255, nullable: false, name: "name" })
  name: string;

  @Column({ type: "uuid", nullable: true, name: "parentid" })
  parentid: string | null;

  @Column({ type: "varchar", length: 100, nullable: false })
  type: string;
}
