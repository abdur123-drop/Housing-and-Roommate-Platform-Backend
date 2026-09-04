export type TErrorSource = {
	path: string;
	message: string;
};

export class AppError extends Error {
	public statusCode: number;
	/** Field-level detail rendered as the `errors` array in the response. */
	public errorSources: TErrorSource[];

	constructor(
		statusCode: number,
		message: string,
		errorSources: TErrorSource[] = [],
		stack = "",
	) {
		super(message);
		this.statusCode = statusCode;
		this.errorSources = errorSources;

		if (stack) {
			this.stack = stack;
		} else {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}
