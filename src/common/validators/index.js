/* ----------------------------------------  */
/* This is file to hold all the validators  */
/* ----------------------------------------  */

import { ENVIRONMENT } from '../config/environment.js';

// validate required environment variables
export const validateEnvs = () => {
  if (!ENVIRONMENT.DB.URL) {
    throw new Error('⛔️ Missing Database Url');
  }
};
