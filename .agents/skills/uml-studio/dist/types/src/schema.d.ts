export declare const diagramSchema: {
    definitions: {
        cause: {
            type: string;
            properties: Record<string, unknown>;
            required: string[];
            additionalProperties: boolean;
        };
    };
    allOf: ({
        if: {
            properties: {
                type: {
                    const: string;
                    not?: undefined;
                };
            };
        };
        then: {
            required: string[];
            properties: {
                participants: {
                    minItems: number;
                };
                messages: {
                    minItems: number;
                };
                nodes?: undefined;
                lanes?: undefined;
            };
        };
    } | {
        if: {
            properties: {
                type: {
                    const: string;
                    not?: undefined;
                };
            };
        };
        then: {
            required: string[];
            properties?: undefined;
        };
    } | {
        if: {
            properties: {
                type: {
                    not: {
                        enum: string[];
                    };
                    const?: undefined;
                };
            };
        };
        then: {
            required: string[];
            properties: {
                nodes: {
                    minItems: number;
                };
                participants?: undefined;
                messages?: undefined;
                lanes?: undefined;
            };
        };
    } | {
        if: {
            properties: {
                type: {
                    const: string;
                    not?: undefined;
                };
            };
        };
        then: {
            required: string[];
            properties: {
                lanes: {
                    minItems: number;
                };
                participants?: undefined;
                messages?: undefined;
                nodes?: undefined;
            };
        };
    })[];
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
    $schema: string;
    $id: string;
};
