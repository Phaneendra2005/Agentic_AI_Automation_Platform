const { DiscordIntegration } = require('../src/integrations/discordIntegration');
const { DISCORD_BOT_TOKEN } = require('../src/config/env');

async function main() {
  const channelId = process.env.TEST_DISCORD_CHANNEL_ID;
  const token = DISCORD_BOT_TOKEN;
  if (!token) {
    console.error('DISCORD_BOT_TOKEN not configured in env. Set it or export DISCORD_BOT_TOKEN for this test.');
    process.exit(1);
  }
  if (!channelId) {
    console.error('Please set TEST_DISCORD_CHANNEL_ID environment variable to a channel ID for testing.');
    process.exit(1);
  }

  const integration = new DiscordIntegration({ accessToken: token });
  try {
    const res = await integration.send({ channelId, message: `Test message from integration at ${new Date().toISOString()}` });
    console.log('Send result:', res);
    process.exit(0);
  } catch (err) {
    console.error('Send failed:', err.message, 'code=', err.code);
    process.exit(2);
  }
}

main();
