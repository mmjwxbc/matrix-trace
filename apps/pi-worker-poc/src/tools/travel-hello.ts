export interface TravelHelloParams {
  city: string;
}

export function createTravelHelloTool() {
  return {
    name: "travel_hello",
    label: "Travel Hello",
    description: "Return a deterministic starter travel suggestion",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string" }
      },
      required: ["city"],
      additionalProperties: false
    },
    async execute(_toolCallId: string, params: TravelHelloParams) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Starter suggestion for ${params.city}: begin with one landmark, then add one meal stop nearby.`
          }
        ],
        details: {}
      };
    }
  };
}
