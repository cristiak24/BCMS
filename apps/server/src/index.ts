import { loadServerEnv } from './lib/loadEnv';
import { app } from './app';

loadServerEnv();

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
