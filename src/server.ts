import app from "./app";
import config from "./app/config";
import { prisma } from "./app/lib/prisma";
import { seedAdmin, seedRoles } from "./app/utils/seed";

const PORT = config.port ?? 5000;

const main = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to the database successfully.");

		await seedRoles();
		await seedAdmin();

		app.listen(PORT, () => {
			console.log(`Server is running on port ${PORT}`);
		});
	} catch (error) {
		console.error("Error starting the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

main();
