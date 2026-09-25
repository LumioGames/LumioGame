/**
 * 契约里的 `ulong` 一律用这个别名承载（原型量级远低于 2^53）。
 * 将来接 .NET WASM Replica 时若需要 bigint，只改这一处。
 */
export type U64 = number

/** 「无实体」的哨兵值，对应 C# 契约里 `*NetEntityIdRaw == 0`（如 HatKingNetEntityIdRaw = 0 表示无帽王）。 */
export const NO_ENTITY: U64 = 0
