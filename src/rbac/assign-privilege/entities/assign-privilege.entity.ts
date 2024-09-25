import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, BaseEntity } from 'typeorm';

@Entity({ name: 'RolePrivilegesMapping' })
export class RolePrivilegeMapping {
    @PrimaryGeneratedColumn('uuid', { name: 'rolePrivilegesId' })
    rolePrivilegesId: string;

    @Column('uuid', { name: 'roleId' })
    roleId: string;

    @Column('uuid',{ name: 'tenantId'})
    tenantId: string;

    @Column('uuid', { name: 'createdBy', nullable: true })
    createdBy: string | null;

    @Column('uuid', { name: 'updatedBy', nullable: true })
    updatedBy: string | null;

    @CreateDateColumn({ name: 'createdAt', type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updatedAt', type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
    updatedAt: Date;

    @Column('uuid', { name: 'privilegeId', nullable: true })
    privilegeId: string | null;
}



