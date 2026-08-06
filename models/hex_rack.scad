// Catan box insert - hex rack
// Spec: docs/superpowers/specs/2026-08-02-catan-box-insert-design.md
//
// Hexes stand on edge, filing-cabinet style, partitioned by game so setup
// is "lift out a block" rather than counting tiles by terrain.
//
// Render the coupon first (part = "coupon"), test-fit a real tile, and only
// then print the full rack.

/* [Part] */
// Which object to render
part = "rack"; // [rack, coupon]

/* [Tile] */
// Terrain hex, flat edge to opposite flat edge
tile_across_flats = 80;
// Per-tile thickness. Measure a stack of 10 and divide.
tile_thickness = 2.0;

/* [Fit] */
// Gap per side between tile and channel. Loose by choice.
clearance = 0.8;
// Extra slot width so blocks are never jammed. 1.10 = 10% roomier.
slack = 1.10;

/* [Structure] */
// Dividers, end walls and long sides. 10mm gives fingers somewhere to go.
wall = 10;
// HARD CEILING - see spec section 6. 80 tile + 1.5 floor + 3 books + 1
// clearance = 85.5 of an 86mm interior. Any thicker and the lid stops closing.
floor_t = 1.5;
// Overall rack height. Tiles stand 80mm and deliberately protrude above this.
total_h = 50;

/* [Labels] */
// Engrave block names into the divider top faces
label_enable = true;
label_size = 6;
label_depth = 0.6;

/* [Blocks] */
// One entry per partition. Order is left to right.
block_names = ["BASE 4P", "5-6 EXT", "SEAFARERS", "SF 5-6"];
block_counts = [19, 11, 30, 10];

/* [Coupon] */
// Tiles the test coupon's single slot should hold
coupon_tiles = 3;

/* [Hidden] */
$fn = 48;
eps = 0.01;

// ---------------------------------------------------------------- derived

// A hex standing on a flat edge is point-to-point wide, not across-flats.
tile_p2p = tile_across_flats / cos(30);
// Edge length. across_flats = side * sqrt(3), so the flat the tile rests on
// is this long.
tile_side = tile_across_flats / sqrt(3);
// The socket's flared faces sit at 60 degrees, so a perpendicular gap of
// `clearance` measures this much horizontally.
clearance_h = clearance / cos(30);

// Socket half-widths: at the resting flat, and at the tile's widest point.
sock_half_bottom = tile_side / 2 + clearance_h;
sock_half_wide = tile_p2p / 2 + clearance_h;
// Height at which the flare reaches full width - the tile's mid-height.
sock_flare_h = tile_across_flats / 2;

channel_d = 2 * sock_half_wide;
outer_d = channel_d + 2 * wall;

n_blocks = len(block_counts);
cavity_h = total_h - floor_t;

function slot_w(i) = block_counts[i] * tile_thickness * slack;
function slots_before(i) = i <= 0 ? 0 : slot_w(i - 1) + slots_before(i - 1);

slots_total = slots_before(n_blocks);
outer_l = slots_total + (n_blocks + 1) * wall;

// Left edge of block i
function slot_x(i) = wall * (i + 1) + slots_before(i);

// ---------------------------------------------------------------- modules

// Cross-section of a socket, in (depth, height), centred on depth 0.
//
// Follows the tile's own silhouette for the lower half - flat bottom, then
// 60-degree flares out to full width at mid-height - and goes vertical above
// that. Following the full hex would close back in over the tile and trap it.
//
// The tile's lower edges land on the flared faces, so a block self-centres
// and cannot slump sideways.
module socket_profile() {
    polygon([
        [-sock_half_bottom, 0],
        [-sock_half_wide, sock_flare_h],
        [-sock_half_wide, cavity_h + eps],
        [ sock_half_wide, cavity_h + eps],
        [ sock_half_wide, sock_flare_h],
        [ sock_half_bottom, 0],
    ]);
}

// One socket cut, open at the top.
// The rotate pair maps the 2D profile's (depth, height) onto (Y, Z) and
// extrudes along X, so `w` becomes the slot width.
module slot_cut(x, w) {
    translate([x, outer_d / 2, floor_t])
        rotate([0, 0, 90])
            rotate([90, 0, 0])
                linear_extrude(w)
                    socket_profile();
}

// Name engraved into the top face of the divider left of block i
module block_label(i) {
    translate([slot_x(i) - wall / 2, outer_d / 2, total_h - label_depth])
        linear_extrude(label_depth + eps)
            rotate([0, 0, 90])
                text(block_names[i],
                     size = label_size,
                     halign = "center",
                     valign = "center",
                     font = "Liberation Sans:style=Bold");
}

module hex_rack() {
    difference() {
        cube([outer_l, outer_d, total_h]);
        for (i = [0 : n_blocks - 1]) slot_cut(slot_x(i), slot_w(i));
        if (label_enable)
            for (i = [0 : n_blocks - 1]) block_label(i);
    }
}

// Short section for fit testing: one slot, both end walls, full channel depth
// and full height. Everything that can go wrong dimensionally is present.
module coupon() {
    w = coupon_tiles * tile_thickness * slack;
    difference() {
        cube([w + 2 * wall, outer_d, total_h]);
        slot_cut(wall, w);
    }
}

// ---------------------------------------------------------------- render

if (part == "rack") hex_rack();
else coupon();

// ---------------------------------------------------------------- report

echo(str("tile point-to-point: ", tile_p2p, "mm"));
echo(str("socket: flat ", 2 * sock_half_bottom, "mm wide, flaring to ",
         channel_d, "mm at ", sock_flare_h, "mm, vertical above"));
echo(str("slot widths: ", [for (i = [0 : n_blocks - 1]) slot_w(i)]));
echo(str("slots total: ", slots_total, "mm"));
echo(str("RACK EXTERNAL: ", outer_l, " x ", outer_d, " x ", total_h, "mm"));
echo(str("standing tile height: ", tile_across_flats,
         "mm + floor ", floor_t, " = ", tile_across_flats + floor_t, "mm"));
