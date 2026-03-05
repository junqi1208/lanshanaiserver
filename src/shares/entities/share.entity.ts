import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Share {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  token!: string;

  @Column()
  userId!: string;

  @Column()
  conversationId!: string;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text' })
  snapshot!: string;

  @CreateDateColumn()
  createdAt!: Date;
}

