import { Model, DataTypes } from '@sequelize/core';
import type { Sequelize } from '@sequelize/core';

export class Capability extends Model {
  declare id: string;
  declare type: string;
  declare label: string;
  declare parentCapId: string | null;
}

export type CapabilityOptions = {
  type: string;
  label: string;
  parentCap: Capability | null;
}

export function initCapabilityModel(sequelize: Sequelize) {
  return Capability.init({
    id: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    label: {
      type: DataTypes.STRING,
      allowNull: false
    },
    parentCapId: {
      type: DataTypes.STRING,
      allowNull: true,
      columnName: 'parent_cap_id'
    }
  }, {
    sequelize,
    modelName: 'capabilities',
    tableName: 'capabilities',
    timestamps: false,
    freezeTableName: true
  });
}

export function labelForCapabilityChain(chain: Capability[]) {
  return chain.map(cap => `${cap.label}`).join('/');
}