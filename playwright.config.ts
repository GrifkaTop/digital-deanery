import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',workers:1,use:{baseURL:process.env.PLAYWRIGHT_BASE_URL ?? 'https://localhost',ignoreHTTPSErrors:true,trace:'off',screenshot:'off',video:'off',launchOptions:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{}},reporter:'list'});
