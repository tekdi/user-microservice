import {
  Entity,
  Column,
  CreateDateColumn,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Content } from './content.entity';
import { ContentType } from './content-type.entity';
import { Tag } from '../../pathways/tags/entities/tag.entity';

@Entity('content_tag_map')
export class ContentTagMap {
  @PrimaryColumn({ name: 'content_id', type: 'uuid' })
  contentId: string;

  @PrimaryColumn({ name: 'tag_id', type: 'uuid' })
  tagId: string;

  @PrimaryColumn({ name: 'type_id', type: 'uuid' })
  typeId: string;

  @CreateDateColumn({ name: 'tag_date', type: 'timestamptz' })
  tagDate: Date;

  @ManyToOne(() => Content, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_id' })
  content: Content;

  @ManyToOne(() => Tag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;

  @ManyToOne(() => ContentType, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'type_id' })
  contentType: ContentType;
}
