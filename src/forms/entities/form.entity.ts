import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Generated } from 'typeorm';

@Entity({ name: 'forms' })
export class Form {
    @PrimaryGeneratedColumn('uuid')
    formid: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdat: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedat: Date;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'uuid'})
    tenantId: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    context: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    contextType: string;

    @Column({ type: 'jsonb', nullable: true })
    fields: object;
}
