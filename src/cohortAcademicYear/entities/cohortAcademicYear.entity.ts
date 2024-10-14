import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('CohortAcademicYear')
export class CohortAcademicYear {
    @PrimaryGeneratedColumn('uuid')
    cohortAcademicYearId: string;

    @Column({ type: 'uuid' })
    cohortId: string;

    @Column({ type: 'uuid' })
    academicYearId: string;

    @Column({ type: 'uuid' })
    createdBy: string;

    @Column({ type: 'uuid' })
    updatedBy: string;

    @CreateDateColumn({ type: 'date', default: () => 'CURRENT_DATE' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'date', default: () => 'CURRENT_DATE' })
    updatedAt: Date;

}