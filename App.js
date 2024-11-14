import "react-native-reanimated";
import { SafeAreaView, StyleSheet, Text, View, ActivityIndicator, TextInput, TouchableOpacity, Image, PermissionsAndroid, Alert, ScrollView, Dimensions } from "react-native";
import { Camera, useCameraDevice, useFrameProcessor, useCodeScanner } from "react-native-vision-camera";
import DropDownPicker from "react-native-dropdown-picker";
import Video from "react-native-video";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as VCFaceDetector from "react-native-vision-camera-face-detector";
import { Worklets } from "react-native-worklets-core";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, { withSpring, useAnimatedProps } from "react-native-reanimated";
import Animated from "react-native-reanimated";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const CAMERA_HEIGHT = SCREEN_HEIGHT * 0.5;

const FaceBox = React.memo(({ face, isFrontCamera }) => {
  const animatedProps = useAnimatedProps(() => {
    let boxX = face.x;
    if (isFrontCamera) {
      boxX = SCREEN_WIDTH - (boxX + face.width);
    }
    return {
      transform: [{ translateX: withSpring(boxX, { damping: 20, stiffness: 100 }) }, { translateY: withSpring(face.y, { damping: 20, stiffness: 100 }) }],
      width: withSpring(face.width, { damping: 20, stiffness: 100 }),
      height: withSpring(face.height, { damping: 20, stiffness: 100 }),
      borderWidth: 2,
      borderColor: "#00ff00",
      borderRadius: 8,
    };
  }, [face, isFrontCamera]);

  return <Reanimated.View animatedProps={animatedProps} style={{ position: "absolute" }} />;
});

export default function App() {
  const camera = useRef(null);
  const [cameraPermission, setCameraPermission] = useState();
  const [open, setOpen] = useState(false);
  const [currentExample, setCurrentExample] = useState("");
  const [photoPath, setPhotoPath] = useState();
  const [snapshotPath, setSnapshotPath] = useState();
  const [videoPath, setVideoPath] = useState();
  const [flash, setFlash] = useState("off"); //on/off
  const [galleryImage, setGalleryImage] = useState("");
  const [cameraType, setCameraType] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const devicesFront = useCameraDevice("front");
  const deviceBack = useCameraDevice("back", {
    physicalDevices: ["ultra-wide-angle-camera", "wide-angle-camera", "telephoto-camera"],
  });
  const [faces, setFaces] = useState([]);
  const prevFacesRef = useRef([]);
  const toggleCamera = () => {
    setCameraType((prev) => !prev);
    setFaces([]); // Clear faces when switching the camera to avoid stale data
    prevFacesRef.current = [];
  };
  const getAllPermissions = useCallback(async () => {
    PermissionsAndroid.requestMultiple([PermissionsAndroid.PERMISSIONS.CAMERA, PermissionsAndroid.PERMISSIONS.RECORD_AUDIO]).then((result) => {
      if (result["android.permission.CAMERA"] === "granted" && result["android.permission.RECORD_AUDIO"] === "granted") {
        setCameraPermission(result["android.permission.CAMERA"]);
      } else {
        Alert.alert("Permission Not Granted", "You need to grant this app permission to use the camera to record audio and video", [
          {
            text: "Cancel",
            onPress: () => navigation.pop(),
          },
          {
            text: "Grant",
            onPress: () => Linking.openSettings(),
          },
        ]);
      }
    });
  }, []);

  useEffect(() => {
    getAllPermissions();
    return () => {};
  }, []);

  const faceDetectionOptions = useRef({
    performanceMode: "accurate",
    classificationMode: "all",
    autoScale: true,
    trackingEnabled: true,
    // contourMode:'all',
  }).current;

  const { detectFaces } = VCFaceDetector.useFaceDetector(faceDetectionOptions);

  // Convert normalized coordinates to screen coordinates
  const normalizeCoordinates = useCallback(
    (face) => {
      const flipX = devicesFront === "front";

      // Scale coordinates to camera view dimensions
      const boxWidth = face.bounds.width * SCREEN_WIDTH;
      const boxHeight = face.bounds.height * CAMERA_HEIGHT; // Use camera height for scaling

      let boxX = face.bounds.x * SCREEN_WIDTH;
      if (flipX) {
        boxX = SCREEN_WIDTH - (boxX + boxWidth);
      }
      // Scale Y coordinate to camera height instead of screen height
      const boxY = face.bounds.y * CAMERA_HEIGHT;
      return {
        width: boxWidth,
        height: boxHeight,
        x: Math.max(0, Math.min(boxX, SCREEN_WIDTH - boxWidth)), // Keep within bounds
        y: Math.max(0, Math.min(boxY, CAMERA_HEIGHT - boxHeight)), // Keep within camera view
        id: face.trackingId || Math.random().toString(),
        // Additional face data that might be useful
        smile: face.smilingProbability,
        leftEyeOpen: face.leftEyeOpenProbability,
        rightEyeOpen: face.rightEyeOpenProbability,
        yawAngle: face.yawAngle,
        rollAngle: face.rollAngle,
      };
    },
    [cameraType]
  );

  const onFaceDetected = Worklets.createRunOnJS((faces) => {
    const normalizedFaces = faces.map((face) => normalizeCoordinates(face));
    // Update faces only when the length has changed
    if (normalizedFaces !== prevFacesRef.current) {
      setFaces(normalizedFaces);
      prevFacesRef.current = normalizedFaces;
    }
  });

  const frameProcessor = useFrameProcessor((frame) => {
    "worklet";
    const faces = detectFaces(frame);
    // console.log(JSON.stringify(faces), JSON.stringify(frame));
    if (faces.length > 0) {
      onFaceDetected(faces);
    }
  }, []);
  const SmileEmoji = ({ probability }) => {
    let emoji;
    if (probability >= 0.7) {
      emoji = "😄"; // Happy
    } else if (probability >= 0.4) {
      emoji = "🙂"; // Neutral
    } else {
      emoji = "😐"; // Sad
    }

    return <Text style={{ fontSize: 24 }}>{emoji}</Text>;
  };

  const renderFaceDetect = () => {
    return (
      <View>
        <Camera style={[styles.camera, { height: CAMERA_HEIGHT }]} isMirrored={false} frameProcessor={frameProcessor} device={cameraType ? deviceBack : devicesFront} isActive={isActive} Ï />
        <Text style={styles.totalFaces}>{`Faces Detect: ${faces?.length}`}</Text>
        {faces.map((face) => {
          return <FaceBox key={face?.id} face={face} isFrontCamera={cameraType} />;
        })}
      </View>
    );
  };

  const handleTakePhoto = async () => {
    try {
      const photo = await camera.current.takePhoto({
        flash: flash,
      });
      const fileUri = `file://${photo.path}`;
      setPhotoPath(fileUri);
    } catch (e) {
      console.log(e);
    }
  };

  const renderTakingPhoto = () => {
    return (
      <View>
        <Camera ref={camera} style={[styles.camera, { height: CAMERA_HEIGHT }, styles.photoAndVideoCamera]} device={cameraType ? deviceBack : devicesFront} isActive={isActive} Ï photo />
        <TouchableOpacity style={styles.btn} onPress={handleTakePhoto}>
          <Text style={styles.btnText}>Take Photo</Text>
        </TouchableOpacity>
        {photoPath && <Image style={styles.image} source={{ uri: photoPath }} />}
      </View>
    );
  };

  const handleRecordVideo = async () => {
    try {
      camera.current.startRecording({
        flash: flash,
        onRecordingFinished: (video) => setVideoPath(video.path),
        onRecordingError: (error) => console.error(error),
      });
    } catch (e) {
      console.log(e);
    }
  };

  const handleStopVideo = async () => {
    try {
      await camera.current.stopRecording();
    } catch (e) {
      console.log(e);
    }
  };

  const renderRecordingVideo = () => {
    return (
      <View>
        <Camera ref={camera} style={[styles.camera, { height: CAMERA_HEIGHT }, styles.photoAndVideoCamera]} device={cameraType ? deviceBack : devicesFront} isActive={isActive} Ï video />
        <View style={styles.btnGroup}>
          <TouchableOpacity style={styles.btn} onPress={handleRecordVideo}>
            <Text style={styles.btnText}>Record Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ ...styles.btn }} onPress={handleStopVideo}>
            <Text style={styles.btnText}>Stop Video</Text>
          </TouchableOpacity>
        </View>
        {videoPath && <Video source={{ uri: videoPath }} style={styles.video} />}
      </View>
    );
  };

  const handleTakeSnapshot = async () => {
    try {
      const snapshot = await camera.current.takeSnapshot({
        quality: 85,
        skipMetadata: true,
      });
      const fileUri = `file://${snapshot.path}`;
      setSnapshotPath(fileUri);
    } catch (e) {
      console.log(e);
    }
  };

  const renderTakingSnapshot = () => {
    return (
      <View>
        <Camera ref={camera} style={[styles.camera, { height: CAMERA_HEIGHT }, styles.photoAndVideoCamera]} device={cameraType ? deviceBack : devicesFront} isActive={isActive} Ï photo />
        <TouchableOpacity style={styles.btn} onPress={handleTakeSnapshot}>
          <Text style={styles.btnText}>Take Snapshot</Text>
        </TouchableOpacity>
        {snapshotPath && <Image style={styles.image} source={{ uri: snapshotPath }} />}
      </View>
    );
  };

  const handleGallery = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    console.log(result);

    if (!result.canceled) {
      setGalleryImage(result.assets[0].uri);
    }
  };
  const renderGallery = () => {
    return (
      <View>
        <TouchableOpacity style={styles.btn} onPress={handleGallery}>
          <Text style={styles.btnText}>Open Gallery</Text>
        </TouchableOpacity>
        {galleryImage && <Image style={styles.image} source={{ uri: galleryImage }} />}
      </View>
    );
  };

  const renderContent = () => {
    if (deviceBack == null || devicesFront == null) {
      return <ActivityIndicator size="large" color="#1C6758" />;
    }
    if (cameraPermission !== "granted") {
      return null;
    }
    switch (currentExample) {
      case "take-photo":
        return renderTakingPhoto();
      case "record-video":
        return renderRecordingVideo();
      case "take-snapshot":
        return renderTakingSnapshot();
      case "open-gallery":
        return renderGallery();
      case "face-detect":
        return renderFaceDetect();
      default:
        return null;
    }
  };
  const handleChangePicketSelect = (value) => {
    setPhotoPath(null);
    setSnapshotPath(null);
    setVideoPath(null);
    setCurrentExample(value);
  };

  return (
    <View style={styles.screen}>
      {/* <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}> */}
      <SafeAreaView style={styles.saveArea}>
        <View style={styles.header}>
          <Text style={styles.headerText}>With Vision Camera</Text>
        </View>
      </SafeAreaView>
      <TouchableOpacity onPress={() => toggleCamera()} style={{ padding: 10, marginHorizontal: 10, marginVertical: 15, borderRadius: 100, alignSelf: "flex-end", backgroundColor: "#567cff" }}>
        <Ionicons color={"#fff"} name="camera-reverse" size={20} />
      </TouchableOpacity>
      <View style={styles.dropdownPickerWrapper}>
        <DropDownPicker
          open={open}
          value={currentExample}
          items={[
            { label: "Take Photo", value: "take-photo" },
            { label: "Record Video", value: "record-video" },
            { label: "Take Snapshot", value: "take-snapshot" },
            { label: "Open Gallery", value: "open-gallery" },
            { label: "Face Detect", value: "face-detect" },
          ]}
          setOpen={setOpen}
          setValue={handleChangePicketSelect}
        />
      </View>
      {renderContent()}
      {/* </ScrollView> */}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#EEF2E6",
  },
  saveArea: {
    backgroundColor: "#567cff",
  },
  header: {
    paddingTop: 40,
    paddingBottom: 10,
    backgroundColor: "#567cff",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    color: "#ffffff",
    fontSize: 20,
  },
  caption: {
    height: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  captionText: {
    color: "#100F0F",
    fontSize: 16,
    fontWeight: "600",
  },
  camera: {
    width: "90%",
    alignSelf: "center",
  },
  photoAndVideoCamera: {
    height: 360,
  },
  barcodeText: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    textAlign: "center",
    color: "#100F0F",
    fontSize: 24,
  },
  pickerSelect: {
    paddingVertical: 12,
  },
  image: {
    marginHorizontal: 16,
    paddingTop: 8,
    width: 100,
    height: 100,
  },
  dropdownPickerWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    zIndex: 1,
    marginTop: 10,
  },
  btnGroup: {
    margin: 16,
    flexDirection: "row",
  },
  btn: {
    backgroundColor: "#567cff",
    margin: 13,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 8,
  },
  btnText: {
    color: "#ffffff",
    fontSize: 20,
    textAlign: "center",
  },
  video: {
    marginHorizontal: 16,
    height: 100,
    width: 80,
    position: "absolute",
    right: 0,
    bottom: -80,
  },
  faceDetailText: { marginRight: 10, marginTop: 5, fontSize: 12, color: "red", fontWeight: "500" },
  totalFaces: { alignSelf: "center", fontSize: 20, marginTop: 10, fontWeight: "800", color: "#567cff" },
  faceDetailContainer: { paddingHorizontal: 20, marginTop: 10 },
});
