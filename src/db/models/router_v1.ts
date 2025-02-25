import { Model, DataTypes } from '@sequelize/core';
import type { Sequelize } from '@sequelize/core';
import { Capability } from './capability.js';

type RouterV1Model = {
  id: string;
  pathTemplate: string | null;
  transformFn: string;
  secrets: string;
  requestCount: number;
  lastUsedAt: Date | null;
}

export class RouterV1 extends Model<RouterV1Model> {
  declare id: string;  // Same as router capability id
  declare pathTemplate: string | null;
  declare transformFn: string;
  declare secrets: string;  // JSON blob
  declare requestCount: number;
  declare lastUsedAt: Date | null;
}

// Base type without system-managed fields
export type RouterV1Options = {
  pathTemplate?: string;
  transformFn: string;
  secrets?: Record<string, any>;
}

export type RouterV1Serialized = Omit<RouterV1Options, 'secrets'> & {
  secrets: string;
}

export function initRouterV1Model(sequelize: Sequelize) {
  return RouterV1.init({
    id: {
      type: DataTypes.STRING(32),
      primaryKey: true,
      references: {
        model: Capability,
        key: 'id'
      }
    },
    pathTemplate: {
      type: DataTypes.TEXT,
      allowNull: true,
      columnName: 'path_template'
    },
    transformFn: {
      type: DataTypes.TEXT,
      allowNull: false,
      columnName: 'transform_fn'
    },
    secrets: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}'
    },
    requestCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      columnName: 'request_count'
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      columnName: 'last_used_at'
    }
  }, {
    sequelize,
    modelName: 'router_v1',
    tableName: 'router_v1',
    timestamps: false,
    freezeTableName: true,
    underscored: true
  });
}

export function makeParamsFromOptions (options: RouterV1Options): RouterV1Serialized {
  return {
    ...options,
    secrets: JSON.stringify(options.secrets || {}),
  }
}

export function createRouterV1 (cap: Capability, options: RouterV1Options) {
  const params = makeParamsFromOptions(options);
  return RouterV1.create({
    ...params,
    id: cap.id,
    requestCount: 0,
    lastUsedAt: new Date(),
  });
}