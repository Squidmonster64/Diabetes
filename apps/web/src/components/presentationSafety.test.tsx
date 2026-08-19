import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { REFUSAL_TEMPLATES } from "@diabetes-companion/bolus";
import { RefusalAperture } from "./Aperture.js";
import { RefusalCard } from "./RefusalCard.js";

const doseToken = /\b\d+(?:\.\d+)?\s*(?:u|units)\b/i;

describe("refusal presentation safety", () => {
  it("renders every refusal template without a numeric dose token or dose display", () => {
    for (const [refusalCode, template] of Object.entries(REFUSAL_TEMPLATES)) {
      const markup = renderToStaticMarkup(
        <>
          <RefusalAperture userFacingMessage={template.userFacingMessage} />
          <RefusalCard
            blockingReason={template.blockingReason}
            safeNextStep={template.safeNextStep}
            refusalCategory={template.refusalCategory}
            refusalCode={refusalCode}
          />
        </>,
      );

      const comparableMarkup = markup.replaceAll("&#x27;", "'");
      expect(comparableMarkup, refusalCode).not.toMatch(doseToken);
      expect(comparableMarkup, refusalCode).not.toContain("dose-display");
      expect(comparableMarkup, refusalCode).toContain(template.userFacingMessage);
      expect(comparableMarkup, refusalCode).toContain(template.blockingReason);
      expect(comparableMarkup, refusalCode).toContain(template.safeNextStep);
    }
  });
});
