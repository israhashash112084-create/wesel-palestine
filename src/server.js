import { env } from '#config/env.js';

import app from '#app.js';

const PORT = Number.parseInt(env.PORT, 10);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
