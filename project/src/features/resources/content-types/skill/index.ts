import { Card } from "@/features/resources/content-types/skill/card";
import { Detail } from "@/features/resources/content-types/skill/detail";
import { Form } from "@/features/resources/content-types/skill/form";
import { meta } from "@/features/resources/content-types/skill/meta";
import type { ContentTypeDefinition } from "@/features/resources/content-types/types";

export const skill: ContentTypeDefinition = { ...meta, Card, Detail, Form };
