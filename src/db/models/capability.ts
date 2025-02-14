import { Model, DataTypes } from '@sequelize/core';
import type { Sequelize } from '@sequelize/core';

export class Capability extends Model {
  declare id: string;
  declare type: string;
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
    }
  }, {
    sequelize,
    modelName: 'capabilities',
    tableName: 'capabilities',
    timestamps: false,
    freezeTableName: true
  });
}