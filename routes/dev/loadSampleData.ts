import { SAMPlE_DIR } from "../../samples/dir";
import fs from "fs";
import { bbox as computeBbox } from "@turf/bbox";

export async function loadSampleData(mapboxAccessToken: string) {
  const trackFile = await fs.promises.readFile(
    SAMPlE_DIR + "/track.json",
    "utf8"
  );
  const source = JSON.parse(trackFile);

  const bbox = computeBbox(source);

  const layersFile = await fs.promises.readFile(
    SAMPlE_DIR + "/track_layers.json",
    "utf8"
  );
  const layers = JSON.parse(layersFile);

  return {
    mapboxAccessToken: mapboxAccessToken,
    bbox,
    padding: 50,
    source,
    layers,
  };
}
