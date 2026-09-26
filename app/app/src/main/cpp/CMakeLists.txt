cmake_minimum_required(VERSION 3.22.1)
project(cyberfish_ncnn)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(ncnn SHARED IMPORTED GLOBAL)
set_target_properties(ncnn PROPERTIES
    IMPORTED_LOCATION "${CMAKE_CURRENT_LIST_DIR}/third_party/ncnn/${ANDROID_ABI}/lib/libncnn.so"
    INTERFACE_INCLUDE_DIRECTORIES "${CMAKE_CURRENT_LIST_DIR}/third_party/ncnn/${ANDROID_ABI}/include"
)

add_library(cyberfish_ncnn SHARED ncnn_jni.cpp)
target_include_directories(cyberfish_ncnn PRIVATE
    "${CMAKE_CURRENT_LIST_DIR}/third_party/ncnn/${ANDROID_ABI}/include"
)
target_link_libraries(cyberfish_ncnn ncnn log android)
