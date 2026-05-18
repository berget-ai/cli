import fs from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasEnvKey as hasEnvironmentKey,
  updateEnvFile as updateEnvironmentFile,
} from '../../src/utils/env-manager.js';

vi.mock('fs');
vi.mock('fs/promises');
vi.mock('path');

const mockFs = vi.mocked(fs);
const mockWriteFile = vi.mocked(writeFile);
const mockPath = vi.mocked(path);

describe('env-manager', () => {
  const testEnvironmentPath = '/test/.env';
  const testCwd = '/test';

  beforeEach(() => {
    vi.clearAllMocks();
    mockPath.join.mockReturnValue(testEnvironmentPath);
    vi.spyOn(process, 'cwd').mockReturnValue(testCwd);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updateEnvFile', () => {
    it('should create a new .env file with the key when file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await updateEnvironmentFile({
        comment: 'Test comment',
        key: 'TEST_KEY',
        value: 'test_value',
      });

      expect(mockFs.existsSync).toHaveBeenCalledWith(testEnvironmentPath);
      expect(mockWriteFile).toHaveBeenCalledWith(
        testEnvironmentPath,
        '# Test comment\nTEST_KEY=test_value\n',
      );
    });

    it('should append to existing .env file when key does not exist', async () => {
      const existingContent = 'EXISTING_KEY=existing_value\n';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(existingContent);

      await updateEnvironmentFile({
        comment: 'Test comment',
        key: 'NEW_KEY',
        value: 'new_value',
      });

      expect(mockWriteFile).toHaveBeenCalledWith(
        testEnvironmentPath,
        'EXISTING_KEY=existing_value\nNEW_KEY=new_value\n',
      );
    });

    it('should not update when key already exists and force is false', async () => {
      const existingContent = 'EXISTING_KEY=existing_value\nTEST_KEY=old_value\n';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(existingContent);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await updateEnvironmentFile({
        key: 'TEST_KEY',
        value: 'new_value',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('TEST_KEY already exists in .env - leaving unchanged'),
      );
      expect(mockWriteFile).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should update existing key when force is true', async () => {
      const existingContent = 'EXISTING_KEY=existing_value\nTEST_KEY=old_value\n';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(existingContent);

      await updateEnvironmentFile({
        force: true,
        key: 'TEST_KEY',
        value: 'new_value',
      });

      expect(mockWriteFile).toHaveBeenCalledWith(
        testEnvironmentPath,
        'EXISTING_KEY=existing_value\nTEST_KEY=new_value\n',
      );
    });

    it('should handle complex values with quotes and special characters', async () => {
      mockFs.existsSync.mockReturnValue(false);

      await updateEnvironmentFile({
        comment: 'Complex test',
        key: 'COMPLEX_KEY',
        value: 'value with "quotes" and $special',
      });

      expect(mockWriteFile).toHaveBeenCalledWith(
        testEnvironmentPath,
        '# Complex test\nCOMPLEX_KEY=value with "quotes" and $special\n',
      );
    });

    it('should use custom env path when provided', async () => {
      const customPath = '/custom/.env';
      mockFs.existsSync.mockReturnValue(false);

      await updateEnvironmentFile({
        envPath: customPath,
        key: 'TEST_KEY',
        value: 'test_value',
      });

      expect(mockFs.existsSync).toHaveBeenCalledWith(customPath);
      expect(mockWriteFile).toHaveBeenCalledWith(customPath, 'TEST_KEY=test_value\n');
    });

    it('should throw error when write fails', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockWriteFile.mockRejectedValue(new Error('Write error'));

      await expect(
        updateEnvironmentFile({
          key: 'TEST_KEY',
          value: 'test_value',
        }),
      ).rejects.toThrow('Write error');
    });
  });

  describe('hasEnvKey', () => {
    it('should return false when .env file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = hasEnvironmentKey(testEnvironmentPath, 'TEST_KEY');

      expect(result).toBe(false);
      expect(mockFs.existsSync).toHaveBeenCalledWith(testEnvironmentPath);
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
    });

    it('should return true when key exists in .env file', () => {
      const existingContent = 'KEY1=value1\nTEST_KEY=test_value\nKEY2=value2\n';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(existingContent);

      const result = hasEnvironmentKey(testEnvironmentPath, 'TEST_KEY');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist in .env file', () => {
      const existingContent = 'KEY1=value1\nKEY2=value2\n';
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(existingContent);

      const result = hasEnvironmentKey(testEnvironmentPath, 'TEST_KEY');

      expect(result).toBe(false);
    });

    it('should return false when .env file is malformed', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('Read error');
      });

      const result = hasEnvironmentKey(testEnvironmentPath, 'TEST_KEY');

      expect(result).toBe(false);
    });

    it('should use default path when not provided', () => {
      mockFs.existsSync.mockReturnValue(false);

      hasEnvironmentKey(undefined, 'TEST_KEY');

      expect(mockFs.existsSync).toHaveBeenCalledWith(testEnvironmentPath);
    });
  });
});
