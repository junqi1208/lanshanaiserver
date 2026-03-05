import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';

export type UserRole = 'user' | 'admin';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 50 })
  username!: string;

  @Column({ length: 50, nullable: true })
  nickname?: string;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  gender!: 'male' | 'female' | 'unknown';

  @Column({ type: 'text', nullable: true })
  avatar?: string;

  @Column()
  passwordHash!: string;

  @Column({ type: 'varchar', length: 20, default: 'user' })
  role!: UserRole;

  @OneToMany(() => Conversation, (c) => c.user)
  conversations!: Conversation[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

