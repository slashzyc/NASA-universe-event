import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';

export const visitors=sqliteTable('lm_visitors',{tokenHash:text('token_hash').primaryKey(),createdAt:text('created_at').notNull(),lastSeenAt:text('last_seen_at').notNull()});
export const regions=sqliteTable('lm_regions',{id:text('id').primaryKey(),metadataJson:text('metadata_json').notNull()});
export const datasets=sqliteTable('lm_datasets',{id:text('id').primaryKey(),sha256:text('sha256').notNull(),metadataJson:text('metadata_json').notNull()});
export const releases=sqliteTable('lm_releases',{buildId:text('build_id').primaryKey(),algorithmSha256:text('algorithm_sha256').notNull(),manifestJson:text('manifest_json').notNull()});
export const analyses=sqliteTable('lm_analyses',{id:text('id').primaryKey(),ownerHash:text('owner_hash').notNull().references(()=>visitors.tokenHash),status:text('status').notNull(),createdAt:text('created_at').notNull(),completedAt:text('completed_at'),parametersJson:text('parameters_json').notNull(),recordKey:text('record_key'),recordSha256:text('record_sha256'),errorJson:text('error_json')},table=>[index('lm_analyses_owner').on(table.ownerHash,table.createdAt)]);
export const tasks=sqliteTable('lm_tasks',{id:text('id').primaryKey(),ownerHash:text('owner_hash').notNull().references(()=>visitors.tokenHash),analysisId:text('analysis_id').notNull().references(()=>analyses.id),name:text('name').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()},table=>[index('lm_tasks_owner').on(table.ownerHash,table.createdAt)]);
export const shares=sqliteTable('lm_shares',{tokenHash:text('token_hash').primaryKey(),taskId:text('task_id').notNull().references(()=>tasks.id,{onDelete:'cascade'}),createdAt:text('created_at').notNull()});
export const rates=sqliteTable('lm_request_rates',{id:text('id').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()});
