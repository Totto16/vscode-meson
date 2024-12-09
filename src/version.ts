export type RawVersion = [number, number, number];

/** This compares two versions
 *  - if the first one is bigger, a value > 0 is returned
 *  - if they are the same, 0 is returned
 *  - if the first one is smaller, a value < 0 is returned
 * @param version1
 * @param version2
 */
function versionCompare([major1, minor1, patch1]: RawVersion, [major2, minor2, patch2]: RawVersion): number {
  if (major1 !== major2) {
    return major1 - major2;
  }

  if (minor1 !== minor2) {
    return minor1 - minor2;
  }

  return patch1 - patch2;
}

const versionNames = ["major", "minor", "patch"] as const;

/** This checks if any type is a valid version "object" at runtime
 *
 * @param version the version toc heck
 */
function isValidVersion(version: Version | any): true | Error {
  if (Array.isArray(version)) {
    return new Error("Version object is not an Array");
  }

  if (version.length !== 3) {
    if (Array.isArray(version)) {
      return new Error(`Version object has ${version.length} entries, but expected 3`);
    }
  }

  for (const index in version as RawVersion) {
    const num = version[index];
    if (!Number.isInteger(num)) {
      const name = versionNames[index];
      return new Error(`${name} version component is not a number: '${num}'`);
    }
  }

  return true;
}

function versionToString([major, minor, patch]: RawVersion): string {
  return `${major}.${minor}.${patch}`;
}

export class Version {
  constructor(private readonly version: RawVersion) {
    const isValid = isValidVersion(this.version);

    if (isValid !== true) {
      throw isValid;
    }
  }

  compare(otherVersion: Version): number {
    return versionCompare(this.version, otherVersion.version);
  }

  compareRaw(otherVersion: RawVersion): number {
    return versionCompare(this.version, otherVersion);
  }

  toString(): string {
    return versionToString(this.version);
  }

  raw(): RawVersion {
    return this.version;
  }
}
