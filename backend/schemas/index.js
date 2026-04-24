const { z } = require('zod');

const createJobSchema = z.object({
  body: z.object({
    title: z.string().min(3),
    capacity: z.number().int().positive()
  })
});

const applyJobSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  }),
  body: z.object({
    email: z.string().email().optional()
  }).optional().default({})
});

const getPipelineSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});

const acknowledgeSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});

const statusSchema = z.object({
  params: z.object({
    id: z.string().uuid()
  })
});

module.exports = {
    createJobSchema,
    applyJobSchema,
    getPipelineSchema,
    acknowledgeSchema,
    statusSchema
};
