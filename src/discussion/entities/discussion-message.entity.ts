import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum MessageType {
  TEXT = 'TEXT',
  FILE = 'FILE',
}

@Entity('DiscussionMessages')
@Index(['groupId', 'createdAt'])
@Index(['groupId', 'deletedAt', 'createdAt'])
@Index(['replyToMessageId'])
@Index(['senderId'])
export class DiscussionMessage {
  @PrimaryGeneratedColumn('uuid', { name: 'messageId' })
  messageId: string;

  @Column({ type: 'uuid', name: 'groupId' })
  @Index()
  groupId: string;

  @Column({ type: 'uuid', name: 'senderId' })
  @Index()
  senderId: string;

  @Column({ type: 'varchar', length: 255, name: 'senderName' })
  senderName: string;

  @Column({ type: 'text', name: 'content' })
  content: string;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
    name: 'messageType',
  })
  messageType: MessageType;

  @Column({ type: 'uuid', nullable: true, name: 'replyToMessage_id' })
  replyToMessageId: string | null;

  @Column({ type: 'boolean', default: false, name: 'isEdited' })
  isEdited: boolean;

  @DeleteDateColumn({ name: 'deletedAt', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;

  // Virtual relation - assumes Group entity exists elsewhere
  // @ManyToOne(() => Group, { createForeignKeyConstraints: false })
  // @JoinColumn({ name: 'group_id' })
  // group: Group;
}

