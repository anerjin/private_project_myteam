import { Card } from "@/features/resources/content-types/ai-material/card";
import { Detail } from "@/features/resources/content-types/ai-material/detail";
import { Form } from "@/features/resources/content-types/ai-material/form";
import { meta } from "@/features/resources/content-types/ai-material/meta";
import type { ContentTypeDefinition } from "@/features/resources/content-types/types";

export const aiMaterial: ContentTypeDefinition = {
  ...meta,
  Card,
  Detail,
  Form,
};
