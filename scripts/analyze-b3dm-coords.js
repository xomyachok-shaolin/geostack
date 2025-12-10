const fs = require('fs');
const path = require('path');

// Parse GLB (glTF 2.0 binary)
function parseGLB(buffer, offset = 0) {
  // GLB header
  const magic = buffer.toString('utf8', offset, offset + 4);
  if (magic !== 'glTF') {
    throw new Error('Not a valid GLB file');
  }
  
  const version = buffer.readUInt32LE(offset + 4);
  const length = buffer.readUInt32LE(offset + 8);
  
  console.log('GLB:', { magic, version, length });
  
  // JSON chunk
  const jsonChunkLength = buffer.readUInt32LE(offset + 12);
  const jsonChunkType = buffer.readUInt32LE(offset + 16);
  const jsonData = buffer.toString('utf8', offset + 20, offset + 20 + jsonChunkLength);
  
  const gltf = JSON.parse(jsonData);
  
  console.log('\nglTF Asset:', gltf.asset);
  console.log('Meshes:', gltf.meshes?.length);
  console.log('Accessors:', gltf.accessors?.length);
  console.log('BufferViews:', gltf.bufferViews?.length);
  
  // Binary chunk
  const binaryChunkOffset = offset + 20 + jsonChunkLength;
  const binaryChunkLength = buffer.readUInt32LE(binaryChunkOffset);
  const binaryChunkType = buffer.readUInt32LE(binaryChunkOffset + 4);
  const binaryData = buffer.slice(binaryChunkOffset + 8, binaryChunkOffset + 8 + binaryChunkLength);
  
  console.log('Binary chunk length:', binaryChunkLength);
  
  // Analyze first mesh positions
  if (gltf.meshes && gltf.meshes[0]) {
    const mesh = gltf.meshes[0];
    console.log('\nFirst mesh:', mesh.name);
    
    const primitive = mesh.primitives[0];
    const positionAccessor = gltf.accessors[primitive.attributes.POSITION];
    
    console.log('Position accessor:', {
      componentType: positionAccessor.componentType,
      count: positionAccessor.count,
      type: positionAccessor.type,
      min: positionAccessor.min,
      max: positionAccessor.max,
    });
    
    // Read some vertices
    const bufferView = gltf.bufferViews[positionAccessor.bufferView];
    const offset = (bufferView.byteOffset || 0) + (positionAccessor.byteOffset || 0);
    
    console.log('\nFirst 10 vertices (X, Y, Z):');
    for (let i = 0; i < Math.min(10, positionAccessor.count); i++) {
      const idx = offset + i * 12; // 3 floats * 4 bytes
      const x = binaryData.readFloatLE(idx);
      const y = binaryData.readFloatLE(idx + 4);
      const z = binaryData.readFloatLE(idx + 8);
      console.log(`  ${i}: (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`);
    }
    
    // Analyze coordinate ranges to determine axes
    const { min, max } = positionAccessor;
    const rangeX = max[0] - min[0];
    const rangeY = max[1] - min[1];
    const rangeZ = max[2] - min[2];
    
    console.log('\nCoordinate ranges:');
    console.log(`  X: ${min[0].toFixed(3)} to ${max[0].toFixed(3)} (range: ${rangeX.toFixed(3)})`);
    console.log(`  Y: ${min[1].toFixed(3)} to ${max[1].toFixed(3)} (range: ${rangeY.toFixed(3)})`);
    console.log(`  Z: ${min[2].toFixed(3)} to ${max[2].toFixed(3)} (range: ${rangeZ.toFixed(3)})`);
    
    console.log('\nInterpretation:');
    if (rangeZ < rangeY && rangeZ < rangeX) {
      console.log('  → Model likely uses Y-up (Z is smallest = depth/thickness)');
      console.log('  → Need rotation: X+90° to convert Y-up to Z-up');
    } else if (rangeY < rangeZ && rangeY < rangeX) {
      console.log('  → Model likely uses Z-up (Y is smallest = depth/thickness)');
      console.log('  → No rotation needed!');
    } else {
      console.log('  → Unclear orientation, manual inspection needed');
    }
    
    // Check for nodes with transforms
    if (gltf.nodes) {
      console.log('\nNode transforms:');
      gltf.nodes.forEach((node, i) => {
        if (node.matrix || node.rotation || node.translation || node.scale) {
          console.log(`  Node ${i} (${node.name || 'unnamed'}):`, {
            matrix: node.matrix,
            rotation: node.rotation,
            translation: node.translation,
            scale: node.scale,
          });
        }
      });
    }
  }
}

// Parse B3DM
function parseB3DM(filepath) {
  console.log('Analyzing:', filepath);
  console.log('='.repeat(80));
  
  const buffer = fs.readFileSync(filepath);
  
  // B3DM header (28 bytes)
  const magic = buffer.toString('utf8', 0, 4);
  const version = buffer.readUInt32LE(4);
  const byteLength = buffer.readUInt32LE(8);
  const featureTableJSONByteLength = buffer.readUInt32LE(12);
  const featureTableBinaryByteLength = buffer.readUInt32LE(16);
  const batchTableJSONByteLength = buffer.readUInt32LE(20);
  const batchTableBinaryByteLength = buffer.readUInt32LE(24);
  
  console.log('B3DM Header:', {
    magic,
    version,
    byteLength,
    featureTableJSONByteLength,
    featureTableBinaryByteLength,
    batchTableJSONByteLength,
    batchTableBinaryByteLength,
  });
  
  // Feature table
  if (featureTableJSONByteLength > 0) {
    const featureTableJSON = buffer.toString('utf8', 28, 28 + featureTableJSONByteLength);
    console.log('\nFeature Table JSON:', featureTableJSON);
  }
  
  // GLB starts after all tables
  const gltfStart = 28 + 
    featureTableJSONByteLength + 
    featureTableBinaryByteLength + 
    batchTableJSONByteLength + 
    batchTableBinaryByteLength;
  
  console.log('\n' + '='.repeat(80));
  parseGLB(buffer, gltfStart);
}

// Main
const modelDir = 'data/models/krasnoarmeiskoe/Krasnoarmeiskoe_textured';
const files = fs.readdirSync(modelDir)
  .filter(f => f.endsWith('.b3dm'))
  .slice(0, 3); // Analyze first 3 files

console.log(`Found ${files.length} B3DM files, analyzing first 3...\n`);

files.forEach((file, idx) => {
  if (idx > 0) console.log('\n\n');
  parseB3DM(path.join(modelDir, file));
});
