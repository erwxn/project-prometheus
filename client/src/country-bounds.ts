// Camera extent of the same OCHA COD-AB Morocco polygon used by the pipeline/API.
// Geographic filtering uses the polygon, not these camera bounds. Western Sahara is separate.
export type Country = [name: string, aliases: string[], bounds: [[number, number], [number, number]]];
export const countries: Country[] = [["Morocco",["MA","MAR","Maroc"],[[-11.781930467,27.662037649],[-0.998429,35.9224271]]]];
