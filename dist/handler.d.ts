import { BatchEvent } from "./types";
export declare function handler(event: BatchEvent): Promise<{
    message: string;
    sourceFile: string;
    episodesProcessed: number;
    episodes: {
        title: string;
        pages: string;
    }[];
}>;
