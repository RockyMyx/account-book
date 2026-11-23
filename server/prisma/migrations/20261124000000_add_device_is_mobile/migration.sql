-- 设备表新增 isMobile：仅手机记录最近登录时间，电脑（开发测试）不记
-- SQLite 加列带默认值，兼容已有数据（旧设备默认 false，即不记最近登录）
ALTER TABLE "Device" ADD COLUMN "isMobile" BOOLEAN NOT NULL DEFAULT false;
