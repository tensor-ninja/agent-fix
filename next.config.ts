const nextConfig = {
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  },
};

// Validate required environment variables
const requiredEnvs = ['OPENAI_API_KEY', 'GITHUB_TOKEN'];
requiredEnvs.forEach((env) => {
  if (!process.env[env]) {
    throw new Error(`Environment variable ${env} is required`);
  }
});

export default nextConfig;