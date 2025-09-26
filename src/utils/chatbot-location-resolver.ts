import { DataSource } from "typeorm";

export interface ChatbotUserInput {
  name: string;
  username: string;
  password: string;
  gender: string;
  firstName: string;
  lastName: string;
  role: string;
  state: string; // e.g., "Bihar"
  district: string; // e.g., "SARAN"
  block: string; // e.g., "ISHUAPUR"
  village: string; // e.g., "ISHUAPUR"
}

export interface ChatbotResolvedResponse {
  basics: {
    name: string;
    username: string;
    gender: string;
    firstName: string;
    lastName: string;
    role: string;
  };
  customFields: Array<{ fieldId: string; value: string }>;
}

// These are constant field IDs provided in the requirement
const FIELD_ID_STATE = "800265b1-9058-482a-94f4-726197e1dfe4";
const FIELD_ID_DISTRICT = "62340eaa-40fb-48b9-ba90-dcaa78be778e";
const FIELD_ID_BLOCK = "1e3e76e2-7f77-4fd7-a79f-abe5c33d4d08";
const FIELD_ID_VILLAGE = "2f7e6930-0bc2-4e69-8bd4-dde205fa5471";

function normalizeName(value: string): string {
  return (value || "").trim();
}

// export async function resolveLocationCustomFieldsFromChatbotInput(
//   dataSource: DataSource,
//   input: ChatbotUserInput
// ): Promise<ChatbotResolvedResponse> {
//   console.log("[createFromChatbot] Starting resolution for:", {
//     state: input.state,
//     district: input.district,
//     block: input.block,
//     village: input.village,
//   });

//   const stateName = normalizeName(input.state);
//   const districtName = normalizeName(input.district);
//   const blockName = normalizeName(input.block);
//   const villageName = normalizeName(input.village);

//   if (!stateName || !districtName || !blockName || !villageName) {
//     const msg = "All of state, district, block, and village are required";
//     console.error("[createFromChatbot][validation]", msg);
//     throw new Error(msg);
//   }

//   // 1) Resolve State from public.state
//   const stateRows = await dataSource.query(
//     `SELECT state_id, state_name FROM public.state
//      WHERE is_active = 1 AND LOWER(state_name) = LOWER($1)
//      LIMIT 1`,
//     [stateName]
//   );
//   const state = stateRows && stateRows[0];
//   if (!state) {
//     const msg = `State not found: ${stateName}`;
//     console.error("[createFromChatbot][state]", msg);
//     throw new Error(msg);
//   }
//   console.log("[createFromChatbot][state] Resolved state:", {
//     id: state.state_id,
//     name: state.state_name,
//   });

//   // 2) Resolve District from public.district and check parent
//   const districtRows = await dataSource.query(
//     `SELECT district_id, district_name, state_id FROM public.district
//      WHERE is_active = 1 AND LOWER(district_name) = LOWER($1)
//      LIMIT 1`,
//     [districtName]
//   );
//   const district = districtRows && districtRows[0];
//   if (!district) {
//     const msg = `District not found: ${districtName}`;
//     console.error("[createFromChatbot][district]", msg);
//     throw new Error(msg);
//   }
//   if (Number(district.state_id) !== Number(state.state_id)) {
//     const msg = `District '${district.district_name}' does not belong to state '${state.state_name}'`;
//     console.error("[createFromChatbot][district]", msg, {
//       expectedParentStateId: state.state_id,
//       actualParentStateId: district.state_id,
//     });
//     throw new Error(msg);
//   }
//   console.log("[createFromChatbot][district] Resolved district:", {
//     id: district.district_id,
//     name: district.district_name,
//     state_id: district.state_id,
//   });

//   // 3) Resolve Block from public.block and check parent
//   const blockRows = await dataSource.query(
//     `SELECT block_id, block_name, district_id FROM public.block
//      WHERE is_active = 1 AND LOWER(block_name) = LOWER($1)
//      LIMIT 1`,
//     [blockName]
//   );
//   const block = blockRows && blockRows[0];
//   if (!block) {
//     const msg = `Block not found: ${blockName}`;
//     console.error("[createFromChatbot][block]", msg);
//     throw new Error(msg);
//   }
//   if (Number(block.district_id) !== Number(district.district_id)) {
//     const msg = `Block '${block.block_name}' does not belong to district '${district.district_name}'`;
//     console.error("[createFromChatbot][block]", msg, {
//       expectedParentDistrictId: district.district_id,
//       actualParentDistrictId: block.district_id,
//     });
//     throw new Error(msg);
//   }
//   console.log("[createFromChatbot][block] Resolved block:", {
//     id: block.block_id,
//     name: block.block_name,
//     district_id: block.district_id,
//   });

//   // 4) Resolve Village from public.village and check parent
//   const villageRows = await dataSource.query(
//     `SELECT village_id, village_name, block_id FROM public.village
//      WHERE (is_active = 1 OR is_active IS NULL) AND LOWER(village_name) = LOWER($1)
//      LIMIT 1`,
//     [villageName]
//   );
//   const village = villageRows && villageRows[0];
//   if (!village) {
//     const msg = `Village not found: ${villageName}`;
//     console.error("[createFromChatbot][village]", msg);
//     throw new Error(msg);
//   }
//   if (Number(village.block_id) !== Number(block.block_id)) {
//     const msg = `Village '${village.village_name}' does not belong to block '${block.block_name}'`;
//     console.error("[createFromChatbot][village]", msg, {
//       expectedParentBlockId: block.block_id,
//       actualParentBlockId: village.block_id,
//     });
//     throw new Error(msg);
//   }
//   console.log("[createFromChatbot][village] Resolved village:", {
//     id: village.village_id,
//     name: village.village_name,
//     block_id: village.block_id,
//   });

//   const response: ChatbotResolvedResponse = {
//     basics: {
//       name: input.name,
//       username: input.username,
//       gender: input.gender,
//       firstName: input.firstName,
//       lastName: input.lastName,
//       role: input.role,
//     },
//     customFields: [
//       {
//         fieldId: FIELD_ID_STATE,
//         value: String(state.state_id),
//       },
//       {
//         fieldId: FIELD_ID_DISTRICT,
//         value: String(district.district_id),
//       },
//       {
//         fieldId: FIELD_ID_BLOCK,
//         value: String(block.block_id),
//       },
//       {
//         fieldId: FIELD_ID_VILLAGE,
//         value: String(village.village_id),
//       },
//     ],
//   };

//   console.log("[createFromChatbot] Successfully resolved custom fields");
//   return response;
// }
export async function resolveLocationCustomFieldsFromChatbotInput(
    dataSource: DataSource,
    input: ChatbotUserInput
  ): Promise<ChatbotResolvedResponse> {
    console.log("[createFromChatbot] Starting resolution for:", {
      state: input.state,
      district: input.district,
      block: input.block,
      village: input.village,
    });
  
    const stateName = normalizeName(input.state);
    const districtName = normalizeName(input.district);
    const blockName = normalizeName(input.block);
    const villageName = normalizeName(input.village);
  
    if (!stateName || !districtName || !blockName || !villageName) {
      const msg = "All of state, district, block, and village are required";
      console.error("[createFromChatbot][validation]", msg);
      throw new Error(msg);
    }
  
    // 1) Resolve State from public.state
    const stateRows = await dataSource.query(
      `SELECT state_id, state_name FROM public.state
       WHERE is_active = 1 AND LOWER(state_name) = LOWER($1)
       LIMIT 1`,
      [stateName]
    );
    const state = stateRows && stateRows[0];
    if (!state) {
      const msg = `State not found: ${stateName}`;
      console.error("[createFromChatbot][state]", msg);
      throw new Error(msg);
    }
    console.log("[createFromChatbot][state] Resolved state:", {
      id: state.state_id,
      name: state.state_name,
    });
  
    // 2) Resolve District from public.district and check parent
    const districtRows = await dataSource.query(
      `SELECT district_id, district_name, state_id FROM public.district
       WHERE is_active = 1 AND LOWER(district_name) = LOWER($1)
       LIMIT 1`,
      [districtName]
    );
    const district = districtRows && districtRows[0];
    if (!district) {
      const msg = `District not found: ${districtName}`;
      console.error("[createFromChatbot][district]", msg);
      throw new Error(msg);
    }
    if (Number(district.state_id) !== Number(state.state_id)) {
      const msg = `District '${district.district_name}' does not belong to state '${state.state_name}'`;
      console.error("[createFromChatbot][district]", msg, {
        expectedParentStateId: state.state_id,
        actualParentStateId: district.state_id,
      });
      throw new Error(msg);
    }
    console.log("[createFromChatbot][district] Resolved district:", {
      id: district.district_id,
      name: district.district_name,
      state_id: district.state_id,
    });
  
    // 3) Resolve Block from public.block and check parent
    const blockRows = await dataSource.query(
      `SELECT block_id, block_name, district_id FROM public.block
       WHERE is_active = 1 AND LOWER(block_name) = LOWER($1)
       LIMIT 1`,
      [blockName]
    );
    const block = blockRows && blockRows[0];
    if (!block) {
      const msg = `Block not found: ${blockName}`;
      console.error("[createFromChatbot][block]", msg);
      throw new Error(msg);
    }
    if (Number(block.district_id) !== Number(district.district_id)) {
      const msg = `Block '${block.block_name}' does not belong to district '${district.district_name}'`;
      console.error("[createFromChatbot][block]", msg, {
        expectedParentDistrictId: district.district_id,
        actualParentDistrictId: block.district_id,
      });
      throw new Error(msg);
    }
    console.log("[createFromChatbot][block] Resolved block:", {
      id: block.block_id,
      name: block.block_name,
      district_id: block.district_id,
    });
  
    // 4) Resolve Village from public.village and check parent
    const villageRows = await dataSource.query(
      `SELECT village_id, village_name, block_id FROM public.village
       WHERE (is_active = 1 OR is_active IS NULL) AND LOWER(village_name) = LOWER($1)
       LIMIT 1`,
      [villageName]
    );
    const village = villageRows && villageRows[0];
    if (!village) {
      const msg = `Village not found: ${villageName}`;
      console.error("[createFromChatbot][village]", msg);
      throw new Error(msg);
    }
    if (Number(village.block_id) !== Number(block.block_id)) {
      const msg = `Village '${village.village_name}' does not belong to block '${block.block_name}'`;
      console.error("[createFromChatbot][village]", msg, {
        expectedParentBlockId: block.block_id,
        actualParentBlockId: village.block_id,
      });
      throw new Error(msg);
    }
    console.log("[createFromChatbot][village] Resolved village:", {
      id: village.village_id,
      name: village.village_name,
      block_id: village.block_id,
    });
  
    const response: ChatbotResolvedResponse = {
      basics: {
        name: input.name,
        username: input.username,
        gender: input.gender,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
      },
      customFields: [
        {
          fieldId: FIELD_ID_STATE,
          value: String(state.state_id),
        },
        {
          fieldId: FIELD_ID_DISTRICT,
          value: String(district.district_id),
        },
        {
          fieldId: FIELD_ID_BLOCK,
          value: String(block.block_id),
        },
        {
          fieldId: FIELD_ID_VILLAGE,
          value: String(village.village_id),
        },
      ],
    };
  
    console.log("[createFromChatbot] Successfully resolved custom fields");
    return response;
  }

/**
 * Example usage (not wired):
 *
 *  import { getDataSourceToken, InjectRepository } from '@nestjs/typeorm';
 *  import { Repository } from 'typeorm';
 *  import { Location } from 'src/location/entities/location.entity';
 *  import { resolveLocationCustomFieldsFromChatbotInput } from 'src/utils/chatbot-location-resolver';
 *
 *  constructor(@InjectRepository(Location) private readonly locationRepo: Repository<Location>) {}
 *
 *  async createFromChatbot(dto: ChatbotUserInput) {
 *    return await resolveLocationCustomFieldsFromChatbotInput(this.locationRepo, dto);
 *  }
 */
