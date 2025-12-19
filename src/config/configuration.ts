export default () => ({
  port: parseInt(process.env.PORT || '4005', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
});
