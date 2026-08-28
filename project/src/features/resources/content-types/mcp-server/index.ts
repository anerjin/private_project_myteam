import { Card } from "@/features/resources/content-types/mcp-server/card";
import { Detail } from "@/features/resources/content-types/mcp-server/detail";
import { Form } from "@/features/resources/content-types/mcp-server/form";
import { meta } from "@/features/resources/content-types/mcp-server/meta";
import type { ContentTypeDefinition } from "@/features/resources/content-types/types";

export const mcpServer: ContentTypeDefinition = { ...meta, Card, Detail, Form };
