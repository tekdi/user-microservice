import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity({ name: "location" })
export class Location {
  @PrimaryColumn({ type: "varchar" })
  id: string;
  @Column({ type: "varchar" })
  code: string;
  @Column({ type: "varchar" })
  name: string;
  @Column({ type: "varchar" })
  parentid: string;
  @Column({ type: "varchar" })
  type: string;
}
