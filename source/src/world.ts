export const EPISODE_NAMES = ["basement", "highrise", "spaceship", "unknown"] as const;
export type EpisodeName = (typeof EPISODE_NAMES)[number];
export const CHARACTER_NAMES = ["gjoerup", "haile", "ishii", "ramos", "wolf", "unknown"] as const;
export type CharacterName = (typeof CHARACTER_NAMES)[number];
export const WEAPON_NAMES = [
    "bio_scanner", "bullet_proof_vest", "fire_extinguisher", "fire_proof_suit", "fists",
    "flame_thrower", "flash_light", "hand_grenade", "handgun", "laser_aimed_gun", "mine",
    "night_vision", "none", "pulse_laser", "rocket_launcher", "shotgun", "unknown",
] as const;
export type WeaponName = (typeof WEAPON_NAMES)[number];
export const ITEM_NAMES = [
    "bio_scanner", "bullet_proof_vest", "empty", "fire_extinguisher", "fire_proof_suit",
    "flame_thrower", "flash_light", "hand_grenade", "handgun", "laser_aimed_gun", "mine",
    "night_vision", "pulse_laser", "rocket_launcher", "shotgun", "unknown",
] as const;
export type ItemName = (typeof ITEM_NAMES)[number];
export const LINK_ROLE_NAMES = ["role1", "role2", "single", "unknown"] as const;
export type LinkRoleName = (typeof LINK_ROLE_NAMES)[number];
export const POOL_CHAIN_STATES = ["ok", "cycle", "bad_pointer"] as const;
export type PoolChainState = (typeof POOL_CHAIN_STATES)[number];
const REC_DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
type RecDigit = (typeof REC_DIGITS)[number];
const OTHER_ENTITY_TYPES = ["enemy.gib", "projectile.rocket", "unknown"] as const;
export const ENTITY_TYPES = [...REC_DIGITS.map((d) => `enemy.rec${d}` as const), ...OTHER_ENTITY_TYPES] as const;
export type EntityTypeName = `enemy.rec${RecDigit}` | (typeof OTHER_ENTITY_TYPES)[number];
export const TYPE_ALIASES = ["hydaca", "boss", null] as const;
export type TypeAlias = (typeof TYPE_ALIASES)[number];
export const ENTITY_FORMS = ["live", "corpse", "unknown"] as const;
export type EntityForm = (typeof ENTITY_FORMS)[number];
const REC_VECTOR_SUFFIXES = [
    "ai", "corpse.ai", "corpse.damage", "corpse.draw", "damage", "draw", "mp_secondary", "mp_spawn_init",
] as const;
const OTHER_VECTORS = [
    "enemy.corpse_death.a", "enemy.corpse_death.b", "enemy.death.a", "enemy.death.b",
    "enemy.rec3.ai_alt1",
    "enemy.gib.ai", "enemy.gib.damage", "enemy.gib.draw", "enemy.gib.secondary",
    "flame.ground.ai", "flame.ground.draw", "flame.stream.ai", "flame.stream.ai_in_wall",
    "impact.hit.ai", "impact.hit.draw",
    "mine.blast.ai", "mine.blast.draw", "mine.placed.ai", "mine.placed.damage", "mine.placed.draw",
    "projectile.rocket.ai", "projectile.rocket.draw", "projectile.shot.ai", "projectile.shot.draw", "grenade.thrown.ai", "grenade.thrown.ai_alt", "grenade.thrown.draw", "camera.ai", "camera.draw", "camera.pop.ai", "camera.pop.draw", "camera.damage", "camera.death",
    "link.mirror.event10_tag0a", "link.mirror.event10_tag0b",
    "link.player_mirror.damage", "link.player_mirror.draw",
    "none", "particle.burst.ai", "particle.burst.despawn", "particle.burst.draw", "remove", "unknown",
] as const;
export type VectorName = `enemy.rec${RecDigit}.${(typeof REC_VECTOR_SUFFIXES)[number]}` | (typeof OTHER_VECTORS)[number];
export const VECTOR_NAMES: readonly VectorName[] = [
    ...REC_DIGITS.flatMap((d) => REC_VECTOR_SUFFIXES.map((s) => `enemy.rec${d}.${s}` as const)),
    ...OTHER_VECTORS,
];
const OTHER_ARTS = ["enemy.rec1.art_alt1", "enemy.gib.art", "link.player.art", "none", "unknown"] as const;
export const ART_NAMES: readonly ArtName[] = [
    ...REC_DIGITS.map((d) => `enemy.rec${d}.art` as const), ...OTHER_ARTS,
];
export type ArtName = `enemy.rec${RecDigit}.art` | (typeof OTHER_ARTS)[number];
export interface Core {
    frame: number;
    rng: {
        seed: number;
    };
    phase: number;
}
export interface SoundOptions {
    value: number;
    music: boolean;
    voice_announce: boolean;
    sfx: boolean;
    pcm_voice: boolean;
}
export interface Options {
    sound: SoundOptions;
}
export interface Named<N> {
    value: number;
    name: N;
}
export interface Level {
    episode: Named<EpisodeName>;
    sub_id: number;
    byte: number;
}
export interface MapSection {
    floor: number;
}
export interface Vec2 {
    x: number;
    y: number;
}
export interface Vec3 {
    x: number;
    y: number;
    z: number;
}
export interface Player {
    pos: Vec2;
    angle: number;
    hp: number;
    eye_offset: number;
    z_vel: number;
    jump_timer: number;
    knockback: Vec2;
    speed: {
        forward: number;
        side: number;
    };
    bob_acc: number;
    character: Named<CharacterName>;
    weapon: {
        current: Named<WeaponName>;
        pending: Named<WeaponName>;
    };
    passive: {
        night_vision: number;
        flash_light: number;
        bio_scanner: number;
        bullet_proof_vest: number;
        fire_proof_suit: number;
    };
}
export interface Team {
    alive: {
        ishii: boolean;
        haile: boolean;
        wolf: boolean;
        ramos: boolean;
        gjoerup: boolean;
    };
}
export interface FloorState {
    secured: boolean;
    secured_phase: number;
    enemies_remaining: number;
}
export interface Intro {
    camera: {
        angle: number;
        distance: number;
    };
}
export interface MessageState {
    voice_timer: number;
}
export interface Link {
    role: Named<LinkRoleName>;
    health: number;
}
export interface EntityPool {
    count: number;
    head_slot: number | null;
    walked: number;
    chain: PoolChainState;
}
export interface EntityFlags {
    value: number;
    in_use: boolean;
    on_floor: boolean;
    alive: boolean;
    link_mirror: boolean;
}
export interface EntityVectors {
    damage: VectorName;
    draw: VectorName;
    ai: VectorName;
    death: VectorName;
    secondary: VectorName;
}
export const HIDDEN_TARGET_NAMES = ["none", "player", "unknown"] as const;
export type HiddenTargetName = (typeof HIDDEN_TARGET_NAMES)[number];
export interface HydacaHidden {
    waypoint: Vec2;
    bite_cooldown?: number;
    change_timer?: number;
    second_life?: number;
    origin?: Vec2;
    hit_mark: number;
    target: HiddenTargetName;
    cells_around: readonly (number | null)[];
}
export interface Entity {
    slot: number;
    type: EntityTypeName;
    type_alias: TypeAlias;
    form: EntityForm;
    flags: EntityFlags;
    vec: EntityVectors;
    timer: number;
    pos: Vec3;
    prev: Vec2;
    vel: Vec3;
    floor: number;
    state: number;
    counter: number;
    hp: number;
    anim: number;
    tag: number;
    art: ArtName;
    cell_class: {
        alive: number;
        dead: number;
    };
    hidden?: HydacaHidden;
}
export interface InventoryRow {
    slot: number;
    item: Named<ItemName>;
    amount: number;
}
export interface World {
    schema: "world/1";
    core: Core;
    options: Options;
    level: Level;
    map: MapSection;
    player: Player;
    team: Team;
    floor: FloorState;
    intro: Intro;
    message: MessageState;
    link: Link;
    entity_pool: EntityPool;
    entities: Entity[];
    inventory: InventoryRow[];
}
export type ShapeLeaf<T> = true | readonly T[];
export type Shape<T> = [
    T
] extends [
    readonly (infer U)[]
] ? readonly [
    Shape<U>
] : [
    Exclude<T, undefined>
] extends [
    object
] ? {
    readonly [K in keyof Exclude<T, undefined>]-?: Shape<Exclude<T, undefined>[K]>;
} : ShapeLeaf<T>;
const NAMED_INT = { value: true } as const;
const VEC2 = { x: true, y: true } as const;
const VEC3 = { x: true, y: true, z: true } as const;
export const ENTITY_SHAPE: Shape<Entity> = {
    slot: true,
    type: ENTITY_TYPES,
    type_alias: TYPE_ALIASES,
    form: ENTITY_FORMS,
    flags: { value: true, in_use: true, on_floor: true, alive: true, link_mirror: true },
    vec: { damage: VECTOR_NAMES, draw: VECTOR_NAMES, ai: VECTOR_NAMES, death: VECTOR_NAMES, secondary: VECTOR_NAMES },
    timer: true,
    pos: VEC3,
    prev: VEC2,
    vel: VEC3,
    floor: true,
    state: true,
    counter: true,
    hp: true,
    anim: true,
    tag: true,
    art: ART_NAMES,
    cell_class: { alive: true, dead: true },
    hidden: { waypoint: VEC2, bite_cooldown: true, change_timer: true, second_life: true, origin: VEC2, hit_mark: true, target: HIDDEN_TARGET_NAMES, cells_around: [true] },
};
export const PLAYER_SHAPE: Shape<Player> = {
    pos: VEC2,
    angle: true,
    hp: true,
    eye_offset: true,
    z_vel: true,
    jump_timer: true,
    knockback: VEC2,
    speed: { forward: true, side: true },
    bob_acc: true,
    character: { ...NAMED_INT, name: CHARACTER_NAMES },
    weapon: {
        current: { ...NAMED_INT, name: WEAPON_NAMES },
        pending: { ...NAMED_INT, name: WEAPON_NAMES },
    },
    passive: { night_vision: true, flash_light: true, bio_scanner: true, bullet_proof_vest: true, fire_proof_suit: true },
};
export const CORE_SHAPE: Shape<Core> = { frame: true, rng: { seed: true }, phase: true };
export const WORLD_SHAPE: Shape<World> = {
    schema: ["world/1"],
    core: CORE_SHAPE,
    options: { sound: { value: true, music: true, voice_announce: true, sfx: true, pcm_voice: true } },
    level: { episode: { ...NAMED_INT, name: EPISODE_NAMES }, sub_id: true, byte: true },
    map: { floor: true },
    player: PLAYER_SHAPE,
    team: { alive: { ishii: true, haile: true, wolf: true, ramos: true, gjoerup: true } },
    floor: { secured: true, secured_phase: true, enemies_remaining: true },
    intro: { camera: { angle: true, distance: true } },
    message: { voice_timer: true },
    link: { role: { ...NAMED_INT, name: LINK_ROLE_NAMES }, health: true },
    entity_pool: { count: true, head_slot: true, walked: true, chain: POOL_CHAIN_STATES },
    entities: [ENTITY_SHAPE],
    inventory: [{ slot: true, item: { ...NAMED_INT, name: ITEM_NAMES }, amount: true }],
};
